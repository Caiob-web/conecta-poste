using Microsoft.Data.Sqlite;
using System.Globalization;
using System.IO;
using System.Text;

namespace ConectaPoste.Desktop.Services;

public sealed class DatabaseService
{
    private const uint PostesLightCacheHeaderFlagsV1 = 1; // records incluem flags (material) no uint16 final
    private readonly AppConfigService _config;
    private readonly LoggingService _logs;

    public DatabaseService(AppConfigService config, LoggingService logs)
    {
        _config = config;
        _logs = logs;
    }

    public sealed record LocalDataCounts(
        long Postes,
        long Empresas,
        long Transformadores,
        long Censo);

    public async Task InitializeAsync()
    {
        Directory.CreateDirectory(_config.DataDirectory);
        Directory.CreateDirectory(_config.TilesDirectory);
        Directory.CreateDirectory(_config.CacheDirectory);

        await using var cn = OpenConnection();
        await cn.OpenAsync();

        await ExecAsync(cn, "PRAGMA journal_mode=WAL;");
        await ExecAsync(cn, "PRAGMA synchronous=NORMAL;");
        await ExecAsync(cn, "PRAGMA temp_store=MEMORY;");
        await ExecAsync(cn, "PRAGMA cache_size=-200000;");
        await ExecAsync(cn, "PRAGMA foreign_keys=ON;");

        await ExecAsync(cn, """
            CREATE TABLE IF NOT EXISTS dados_poste (
              id INTEGER NOT NULL PRIMARY KEY,
              coordenadas TEXT NULL,
              lat REAL NULL,
              lon REAL NULL,
              nome_municipio TEXT NULL,
              nome_bairro TEXT NULL,
              nome_logradouro TEXT NULL,
              material TEXT NULL,
              altura REAL NULL,
              tensao_mecanica TEXT NULL,
              qtd_empresas INTEGER NOT NULL DEFAULT 0,
              payload_json TEXT NULL
            );
            """);

        await ExecAsync(cn, """
            CREATE TABLE IF NOT EXISTS empresa_poste (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              id_poste INTEGER NOT NULL,
              empresa TEXT NULL,
              id_insercao TEXT NULL,
              FOREIGN KEY (id_poste) REFERENCES dados_poste(id) ON DELETE CASCADE
            );
            """);

        await ExecAsync(cn, """
            CREATE TABLE IF NOT EXISTS transformadores (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              payload_json TEXT NOT NULL
            );
            """);

        await ExecAsync(cn, """
            CREATE TABLE IF NOT EXISTS censo_municipio (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              poste TEXT NOT NULL
            );
            """);

        await ExecAsync(cn, """
            CREATE TABLE IF NOT EXISTS app_sync_state (
              key TEXT NOT NULL PRIMARY KEY,
              value TEXT NULL,
              updated_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );
            """);

        await ExecAsync(cn, "CREATE INDEX IF NOT EXISTS idx_dados_poste_municipio ON dados_poste(nome_municipio);");
        await ExecAsync(cn, "CREATE INDEX IF NOT EXISTS idx_dados_poste_bairro ON dados_poste(nome_bairro);");
        await ExecAsync(cn, "CREATE INDEX IF NOT EXISTS idx_dados_poste_logradouro ON dados_poste(nome_logradouro);");
        await ExecAsync(cn, "CREATE INDEX IF NOT EXISTS idx_empresa_poste_idposte ON empresa_poste(id_poste);");
        await ExecAsync(cn, "CREATE INDEX IF NOT EXISTS idx_empresa_poste_empresa ON empresa_poste(empresa);");
        await ExecAsync(cn, "CREATE UNIQUE INDEX IF NOT EXISTS uq_empresa_poste_triplet ON empresa_poste(id_poste, COALESCE(empresa,''), COALESCE(id_insercao,''));");

        await ExecAsync(cn, """
            CREATE VIRTUAL TABLE IF NOT EXISTS rtree_postes
            USING rtree(id, minLon, maxLon, minLat, maxLat);
            """);

        await ExecAsync(cn, """
            CREATE TRIGGER IF NOT EXISTS trg_postes_rtree_insert
            AFTER INSERT ON dados_poste
            WHEN NEW.lat IS NOT NULL AND NEW.lon IS NOT NULL
            BEGIN
              INSERT OR REPLACE INTO rtree_postes(id, minLon, maxLon, minLat, maxLat)
              VALUES (NEW.id, NEW.lon, NEW.lon, NEW.lat, NEW.lat);
            END;
            """);

        await ExecAsync(cn, """
            CREATE TRIGGER IF NOT EXISTS trg_postes_rtree_update
            AFTER UPDATE OF lat, lon ON dados_poste
            WHEN NEW.lat IS NOT NULL AND NEW.lon IS NOT NULL
            BEGIN
              INSERT OR REPLACE INTO rtree_postes(id, minLon, maxLon, minLat, maxLat)
              VALUES (NEW.id, NEW.lon, NEW.lon, NEW.lat, NEW.lat);
            END;
            """);

        await ExecAsync(cn, """
            CREATE TRIGGER IF NOT EXISTS trg_postes_rtree_delete
            AFTER DELETE ON dados_poste
            BEGIN
              DELETE FROM rtree_postes WHERE id = OLD.id;
            END;
            """);

        await EnsureColumnAsync(cn, "dados_poste", "qtd_empresas", "INTEGER NOT NULL DEFAULT 0");
        await EnsureColumnAsync(cn, "dados_poste", "payload_json", "TEXT NULL");

        // Se o DB já existia antes do RTree/triggers (upgrade de versão), o índice espacial pode estar vazio.
        // Nesse caso, o modo "viewport (bbox)" não encontra nenhum poste e o mapa parece "não carregar".
        // Fazemos um backfill apenas quando necessário.
        await EnsureRtreeBackfillAsync(cn);

        _logs.LogInfo($"SQLite pronto em: {_config.DatabasePath}");
    }

    public SqliteConnection OpenConnection()
    {
        return new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = _config.DatabasePath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Default
        }.ToString());
    }

    public async Task<string?> GetSyncStateAsync(string key, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(key)) return null;

        await using var cn = OpenConnection();
        await cn.OpenAsync(cancellationToken);

        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "SELECT value FROM app_sync_state WHERE key = @key LIMIT 1;";
        cmd.Parameters.AddWithValue("@key", key.Trim());
        var value = await cmd.ExecuteScalarAsync(cancellationToken);
        return value == null || value == DBNull.Value ? null : value.ToString();
    }

    public async Task SetSyncStateAsync(string key, string? value, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(key)) return;

        await using var cn = OpenConnection();
        await cn.OpenAsync(cancellationToken);

        await using var cmd = cn.CreateCommand();
        cmd.CommandText = """
            INSERT INTO app_sync_state (key, value, updated_utc)
            VALUES (@key, @value, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              updated_utc = excluded.updated_utc;
            """;
        cmd.Parameters.AddWithValue("@key", key.Trim());
        cmd.Parameters.AddWithValue("@value", (object?)value ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<int> GetDatasetVersionAsync(CancellationToken cancellationToken = default)
    {
        await using var cn = OpenConnection();
        await cn.OpenAsync(cancellationToken);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "PRAGMA user_version;";
        var v = await cmd.ExecuteScalarAsync(cancellationToken);
        return Convert.ToInt32(v);
    }

    public async Task<int> BumpDatasetVersionAsync(CancellationToken cancellationToken = default)
    {
        // `user_version` é int32. Usamos UnixTimeSeconds para cache busting previsível.
        var seconds = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var version = seconds > int.MaxValue ? int.MaxValue : (int)seconds;

        await using var cn = OpenConnection();
        await cn.OpenAsync(cancellationToken);
        await using var cmd = cn.CreateCommand();
        // SQLite não aceita parâmetros em PRAGMA. O valor é gerado localmente (int32), então é seguro interpolar.
        cmd.CommandText = $"PRAGMA user_version = {version.ToString(CultureInfo.InvariantCulture)};";
        await cmd.ExecuteNonQueryAsync(cancellationToken);
        return version;
    }

    public string GetPostesLightCacheFilePath(int datasetVersion) =>
        Path.Combine(_config.CacheDirectory, $"postes-light-v{datasetVersion}.bin");

    private static bool CacheFileHasExpectedHeaderFlags(string path, uint expectedFlags)
    {
        try
        {
            if (!File.Exists(path)) return false;
            using var fs = File.Open(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            using var br = new BinaryReader(fs, Encoding.UTF8, leaveOpen: false);

            var b0 = br.ReadByte();
            var b1 = br.ReadByte();
            var b2 = br.ReadByte();
            var b3 = br.ReadByte();
            if (b0 != (byte)'C' || b1 != (byte)'P' || b2 != (byte)'L' || b3 != (byte)'1') return false;

            _ = br.ReadInt32(); // datasetVersion
            _ = br.ReadUInt32(); // recordCount
            _ = br.ReadSingle(); _ = br.ReadSingle(); _ = br.ReadSingle(); _ = br.ReadSingle(); // bbox
            var flags = br.ReadUInt32();
            return flags == expectedFlags;
        }
        catch
        {
            return false;
        }
    }

    public bool HasPostesLightCache(int datasetVersion)
    {
        if (datasetVersion <= 0) return false;
        var path = GetPostesLightCacheFilePath(datasetVersion);
        return CacheFileHasExpectedHeaderFlags(path, PostesLightCacheHeaderFlagsV1);
    }

    public sealed record PostesLightCacheBuildProgress(long Current, long Total, string Message);

    public sealed record PostesLightCacheBuildResult(int DatasetVersion, long RecordsWritten, string FilePath);

    public async Task<PostesLightCacheBuildResult?> EnsurePostesLightCacheAsync(
        IProgress<PostesLightCacheBuildProgress>? progress = null,
        CancellationToken cancellationToken = default)
    {
        // Se não há dados, não cria cache.
        var total = await GetPostesCountAsync();
        if (total <= 0) return null;

        var datasetVersion = await GetDatasetVersionAsync(cancellationToken);
        if (datasetVersion <= 0)
        {
            // Base existente de versões antigas (pré-cache): cria uma versão nova para "cache busting".
            datasetVersion = await BumpDatasetVersionAsync(cancellationToken);
        }

        var cachePath = GetPostesLightCacheFilePath(datasetVersion);
        if (CacheFileHasExpectedHeaderFlags(cachePath, PostesLightCacheHeaderFlagsV1))
        {
            progress?.Report(new PostesLightCacheBuildProgress(total, total, "Cache de visualização já está pronto."));
            return new PostesLightCacheBuildResult(datasetVersion, total, cachePath);
        }

        return await BuildPostesLightCacheAsync(datasetVersion, progress, cancellationToken);
    }

    public async Task<PostesLightCacheBuildResult> BuildPostesLightCacheAsync(
        int datasetVersion,
        IProgress<PostesLightCacheBuildProgress>? progress = null,
        CancellationToken cancellationToken = default)
    {
        if (datasetVersion <= 0) throw new ArgumentOutOfRangeException(nameof(datasetVersion));

        Directory.CreateDirectory(_config.CacheDirectory);

        var outPath = GetPostesLightCacheFilePath(datasetVersion);
        var tmpPath = outPath + ".tmp";

        // Formato binário simples (little-endian):
        //  Header (32 bytes):
        //    0..3   magic "CPL1"
        //    4..7   datasetVersion (int32)
        //    8..11  recordCount (uint32)
        //    12..27 bbox (4x float32: minLat, minLon, maxLat, maxLon)
        //    28..31 headerFlags (uint32) = 1
        //  Records (12 bytes cada):
        //    lat (float32), lon (float32), qtd_empresas (uint16), flags (uint16)
        //      flags: bits 0..7 = materialCode (0=desconhecido, 1=concreto, 2=madeira)

        await using var cn = OpenConnection();
        await cn.OpenAsync(cancellationToken);

        long total = 0;
        await using (var cmdCount = cn.CreateCommand())
        {
            cmdCount.CommandText = "SELECT COUNT(1) FROM dados_poste WHERE lat IS NOT NULL AND lon IS NOT NULL;";
            var v = await cmdCount.ExecuteScalarAsync(cancellationToken);
            total = Convert.ToInt64(v);
        }

        progress?.Report(new PostesLightCacheBuildProgress(0, total, "Gerando cache de visualização (base completa)…"));

        float minLat = float.PositiveInfinity, minLon = float.PositiveInfinity;
        float maxLat = float.NegativeInfinity, maxLon = float.NegativeInfinity;

        long written;

        // Cria arquivo temporário e depois move para o destino (atomicidade).
        await using (var fs = new FileStream(
            tmpPath,
            FileMode.Create,
            FileAccess.Write,
            FileShare.None,
            bufferSize: 1024 * 1024,
            options: FileOptions.Asynchronous | FileOptions.SequentialScan))
        {
            using var bw = new BinaryWriter(fs, Encoding.UTF8, leaveOpen: true);

            // Placeholder do header (escrevemos recordCount e bbox ao final).
            bw.Write((byte)'C'); bw.Write((byte)'P'); bw.Write((byte)'L'); bw.Write((byte)'1');
            bw.Write(datasetVersion);
            bw.Write(0u); // recordCount placeholder
            bw.Write(0f); bw.Write(0f); bw.Write(0f); bw.Write(0f); // bbox placeholder
            bw.Write(PostesLightCacheHeaderFlagsV1); // headerFlags

            written = 0;

            await using var cmd = cn.CreateCommand();
            cmd.CommandText = """
                SELECT lat, lon, COALESCE(qtd_empresas, 0) AS qtd, material
                FROM dados_poste
                WHERE lat IS NOT NULL AND lon IS NOT NULL;
                """;

            await using var r = await cmd.ExecuteReaderAsync(cancellationToken);
            var lastUi = DateTime.UtcNow;
            while (await r.ReadAsync(cancellationToken))
            {
                cancellationToken.ThrowIfCancellationRequested();

                var lat = r.IsDBNull(0) ? (double?)null : r.GetDouble(0);
                var lon = r.IsDBNull(1) ? (double?)null : r.GetDouble(1);
                if (lat is null || lon is null) continue;

                var flat = (float)lat.Value;
                var flon = (float)lon.Value;
                if (!float.IsFinite(flat) || !float.IsFinite(flon)) continue;

                // bbox
                if (flat < minLat) minLat = flat;
                if (flon < minLon) minLon = flon;
                if (flat > maxLat) maxLat = flat;
                if (flon > maxLon) maxLon = flon;

                var qtd = 0;
                try
                {
                    qtd = r.IsDBNull(2) ? 0 : Convert.ToInt32(r.GetValue(2));
                }
                catch
                {
                    qtd = 0;
                }

                var uqtd = (ushort)Math.Clamp(qtd, 0, ushort.MaxValue);

                // material (0=unknown, 1=concrete, 2=wood)
                byte mat = 0;
                try
                {
                    var rawMat = r.IsDBNull(3) ? "" : (r.GetValue(3)?.ToString() ?? "");
                    if (!string.IsNullOrWhiteSpace(rawMat))
                    {
                        var m = rawMat.Trim();
                        if (m.Contains("MADEIRA", StringComparison.OrdinalIgnoreCase) ||
                            m.Contains("WOOD", StringComparison.OrdinalIgnoreCase))
                            mat = 2;
                        else if (m.Contains("CONCRETO", StringComparison.OrdinalIgnoreCase) ||
                                 m.Contains("CONCRETE", StringComparison.OrdinalIgnoreCase))
                            mat = 1;
                    }
                }
                catch
                {
                    mat = 0;
                }

                bw.Write(flat);
                bw.Write(flon);
                bw.Write(uqtd);
                bw.Write((ushort)mat); // flags

                written++;

                if ((DateTime.UtcNow - lastUi).TotalMilliseconds > 350)
                {
                    lastUi = DateTime.UtcNow;
                    progress?.Report(new PostesLightCacheBuildProgress(
                        Current: written,
                        Total: total,
                        Message: $"Gerando cache de visualização… {written:n0}/{total:n0}"));
                }
            }

            // Patch header com recordCount e bbox
            fs.Position = 8; // após magic+version
            bw.Write((uint)Math.Clamp(written, 0, uint.MaxValue));

            // bbox
            if (!float.IsFinite(minLat) || !float.IsFinite(minLon) || !float.IsFinite(maxLat) || !float.IsFinite(maxLon))
            {
                minLat = minLon = maxLat = maxLon = 0f;
            }

            bw.Write(minLat);
            bw.Write(minLon);
            bw.Write(maxLat);
            bw.Write(maxLon);

            bw.Flush();
            await fs.FlushAsync(cancellationToken);
        }

        // Final progress
        progress?.Report(new PostesLightCacheBuildProgress(written, total, $"Cache gerado: {written:n0} pontos."));

        // Move para destino final (substitui se existir)
        try
        {
            if (File.Exists(outPath))
            {
                File.Delete(outPath);
            }
            File.Move(tmpPath, outPath);
        }
        catch
        {
            try { if (File.Exists(tmpPath)) File.Delete(tmpPath); } catch { }
            throw;
        }

        // Limpa caches antigos
        try
        {
            foreach (var f in Directory.EnumerateFiles(_config.CacheDirectory, "postes-light-v*.bin"))
            {
                if (string.Equals(f, outPath, StringComparison.OrdinalIgnoreCase)) continue;
                try { File.Delete(f); } catch { }
            }
        }
        catch { }

        return new PostesLightCacheBuildResult(datasetVersion, written, outPath);
    }

    public async Task<long> GetPostesCountAsync()
    {
        await using var cn = OpenConnection();
        await cn.OpenAsync();
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "SELECT COUNT(1) FROM dados_poste;";
        var v = await cmd.ExecuteScalarAsync();
        return Convert.ToInt64(v);
    }

    public async Task<LocalDataCounts> GetLocalDataCountsAsync(CancellationToken cancellationToken = default)
    {
        await using var cn = OpenConnection();
        await cn.OpenAsync(cancellationToken);

        async Task<long> CountAsync(string table)
        {
            await using var cmd = cn.CreateCommand();
            cmd.CommandText = $"SELECT COUNT(1) FROM {table};";
            var v = await cmd.ExecuteScalarAsync(cancellationToken);
            return Convert.ToInt64(v);
        }

        return new LocalDataCounts(
            Postes: await CountAsync("dados_poste"),
            Empresas: await CountAsync("empresa_poste"),
            Transformadores: await CountAsync("transformadores"),
            Censo: await CountAsync("censo_municipio"));
    }

    private static async Task ExecAsync(SqliteConnection cn, string sql)
    {
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = sql;
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task EnsureColumnAsync(SqliteConnection cn, string table, string column, string definition)
    {
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = $"PRAGMA table_info({table});";
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            var name = r["name"]?.ToString();
            if (string.Equals(name, column, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }
        }

        await using var alter = cn.CreateCommand();
        alter.CommandText = $"ALTER TABLE {table} ADD COLUMN {column} {definition};";
        await alter.ExecuteNonQueryAsync();
    }

    private async Task EnsureRtreeBackfillAsync(SqliteConnection cn)
    {
        try
        {
            // Se não há postes, não há o que fazer.
            await using (var hasPostes = cn.CreateCommand())
            {
                hasPostes.CommandText = "SELECT 1 FROM dados_poste LIMIT 1;";
                var v = await hasPostes.ExecuteScalarAsync();
                if (v is null) return;
            }

            // Se já existe ao menos 1 item no RTree, assumimos OK.
            await using (var hasRtree = cn.CreateCommand())
            {
                hasRtree.CommandText = "SELECT 1 FROM rtree_postes LIMIT 1;";
                var v = await hasRtree.ExecuteScalarAsync();
                if (v is not null) return;
            }

            _logs.LogWarn("RTree vazio detectado. Recriando índice espacial (isso pode levar alguns segundos)…");

            // Backfill em uma transação para performance.
            await using var tx = (SqliteTransaction)await cn.BeginTransactionAsync();
            await using (var cmd = cn.CreateCommand())
            {
                cmd.Transaction = tx;
                cmd.CommandText = "DELETE FROM rtree_postes;";
                await cmd.ExecuteNonQueryAsync();
            }

            await using (var cmd = cn.CreateCommand())
            {
                cmd.Transaction = tx;
                cmd.CommandText = """
                    INSERT OR REPLACE INTO rtree_postes(id, minLon, maxLon, minLat, maxLat)
                    SELECT id, lon, lon, lat, lat
                    FROM dados_poste
                    WHERE lat IS NOT NULL AND lon IS NOT NULL;
                    """;
                await cmd.ExecuteNonQueryAsync();
            }

            await tx.CommitAsync();
            _logs.LogInfo("RTree recriado com sucesso.");
        }
        catch (Exception ex)
        {
            // Nunca impede o app de abrir. Apenas loga para diagnóstico.
            _logs.LogError("Falha ao backfill do RTree.", ex);
        }
    }
}
