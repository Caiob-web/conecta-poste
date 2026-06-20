using System.Globalization;
using System.Text;
using Microsoft.Data.Sqlite;
using Npgsql;

namespace ConectaPoste.Desktop.Services;

public sealed class NeonSyncService
{
    private const string RemoteManifestStateKey = "neon.remote_manifest.v2";
    private const string NeonDatasetVersionStateKey = "neon.dataset_version.v1";
    private const int DeltaBatchSize = 2_000;
    private const int MaxDeltaKeysBeforeFullConfirmation = 150_000;

    private readonly LoggingService _logs;
    private readonly DatabaseService _db;
    private readonly SemaphoreSlim _mutex = new(1, 1);

    public NeonSyncService(LoggingService logs, DatabaseService db)
    {
        _logs = logs;
        _db = db;
    }

    public sealed record NeonSyncResult(
        long PostesUpserted,
        long EmpresasUpserted,
        long TransformadoresImported,
        long CensoImported,
        string Message);

    public sealed record NeonSyncProgress(
        string Phase,
        long Current,
        long Total,
        string Message);

    private sealed record NeonTableFingerprint(
        string TableName,
        long Count,
        string? MaxChangeValue,
        string? MaxKeyValue);

    private sealed record NeonRemoteManifest(
        string Signature,
        long TotalPostes,
        long TotalEmpresas,
        long TotalTransformadores,
        long TotalCenso);

    private sealed record NeonDatasetVersion(
        long Version,
        string? ChangedAt);

    private sealed record NeonRemoteCounts(
        long Postes,
        long Empresas,
        long Transformadores,
        long Censo);

    public async Task TestConnectionAsync(string connectionString, CancellationToken cancellationToken = default)
    {
        try
        {
            var cs = NormalizeNeonConnectionString(connectionString);
            await using var dataSource = NpgsqlDataSource.Create(cs);
            await using var cn = await dataSource.OpenConnectionAsync(cancellationToken).ConfigureAwait(false);
            await using var cmd = new NpgsqlCommand("SELECT 1", cn);
            await cmd.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logs.LogError("Falha ao testar conexão com o NEON.", ex);
            throw;
        }
    }

    public async Task<NeonSyncResult> SyncAsync(
        string connectionString,
        ImportService.ImportMode mode,
        IProgress<NeonSyncProgress>? progress = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new ArgumentException("Connection string vazia.", nameof(connectionString));

        await _mutex.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            _logs.LogInfo($"NEON sync solicitado (mode={mode}).");

            void Report(string phase, string message, long current = 0, long total = 0)
            {
                progress?.Report(new NeonSyncProgress(phase, current, total, message));
            }

            Report("connect", "Conectando ao NEON…");
            var cs = NormalizeNeonConnectionString(connectionString);
            await using var dataSource = NpgsqlDataSource.Create(cs);
            await using var pg = await dataSource.OpenConnectionAsync(cancellationToken).ConfigureAwait(false);

            // Fail fast
            await using (var cmdPing = new NpgsqlCommand("SELECT 1", pg))
            {
                cmdPing.CommandTimeout = 30;
                await cmdPing.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
            }

            var hasDadosPoste = await TableExistsAsync(pg, "dados_poste", cancellationToken).ConfigureAwait(false);
            var hasEmpresaPoste = await TableExistsAsync(pg, "empresa_poste", cancellationToken).ConfigureAwait(false);
            var hasTransformadores = await TableExistsAsync(pg, "transformadores", cancellationToken).ConfigureAwait(false);
            var hasCenso = await TableExistsAsync(pg, "censo_municipio", cancellationToken).ConfigureAwait(false);

            if (!hasDadosPoste)
                throw new InvalidOperationException("Tabela 'dados_poste' não encontrada no NEON (schema public).");

            // Coordenadas no NEON variam: algumas bases têm `lat/lon`, outras `latitude/longitude`, etc.
            // Se existir, preferimos ler lat/lon numérico direto (evita ficar tudo NULL e o mapa não carregar no modo bbox).
            var (latColumn, lonColumn) = await DetectLatLonColumnsAsync(pg, cancellationToken).ConfigureAwait(false);
            var latSql = latColumn is null ? "NULL" : $"d.{latColumn}";
            var lonSql = lonColumn is null ? "NULL" : $"d.{lonColumn}";

            Report("version", "Conferindo versao leve da base NEON...");
            await EnsureNeonSyncControlAsync(
                pg,
                hasEmpresaPoste,
                hasTransformadores,
                hasCenso,
                cancellationToken).ConfigureAwait(false);

            var remoteDatasetVersion = await ReadNeonDatasetVersionAsync(pg, cancellationToken).ConfigureAwait(false);
            var previousDatasetVersionText = await _db.GetSyncStateAsync(NeonDatasetVersionStateKey, cancellationToken).ConfigureAwait(false);
            var previousDatasetVersion = TryParseLong(previousDatasetVersionText);
            var localCounts = await _db.GetLocalDataCountsAsync(cancellationToken).ConfigureAwait(false);
            var remoteCounts = await ReadRemoteDataCountsAsync(
                pg,
                hasEmpresaPoste,
                hasTransformadores,
                hasCenso,
                cancellationToken).ConfigureAwait(false);

            var emptyTableSync = await TryApplyRemoteEmptyTablesAsync(
                remoteCounts,
                localCounts,
                hasEmpresaPoste,
                hasTransformadores,
                hasCenso,
                remoteDatasetVersion,
                Report,
                cancellationToken).ConfigureAwait(false);
            if (emptyTableSync is not null)
                return emptyTableSync;

            if (mode == ImportService.ImportMode.Upsert &&
                localCounts.Postes > 0 &&
                remoteDatasetVersion is not null)
            {
                if (previousDatasetVersion is null || previousDatasetVersion <= 0)
                {
                    if (!CountsCompatibleForCacheSkip(localCounts, remoteCounts, hasEmpresaPoste, hasTransformadores, hasCenso))
                    {
                        throw new InvalidOperationException(
                            "A contagem da base local difere do NEON, mas ainda nao existe versao delta local gravada.\n\n" +
                            "Para proteger o Network Transfer do NEON, o Conecta Poste nao vai baixar a base inteira automaticamente. " +
                            "Use 'Forcar reimportacao completa' somente se precisar reconstruir o SQLite local do zero.");
                    }

                    await _db.SetSyncStateAsync(
                        NeonDatasetVersionStateKey,
                        remoteDatasetVersion.Version.ToString(CultureInfo.InvariantCulture),
                        cancellationToken).ConfigureAwait(false);

                    Report("cache", "Base local ja existe. Versao NEON inicial gravada sem baixar tabelas...");
                    await EnsureLocalMapCacheAsync(Report, cancellationToken).ConfigureAwait(false);

                    var seededMsg =
                        $"Base local preservada. Versao NEON inicial gravada ({remoteDatasetVersion.Version}); nenhuma tabela foi baixada. " +
                        $"postes={localCounts.Postes:n0}, empresas={localCounts.Empresas:n0}, transformadores={localCounts.Transformadores:n0}, censo={localCounts.Censo:n0}.";
                    _logs.LogInfo(seededMsg);
                    return new NeonSyncResult(localCounts.Postes, localCounts.Empresas, localCounts.Transformadores, localCounts.Censo, seededMsg);
                }

                if (previousDatasetVersion.Value == remoteDatasetVersion.Version)
                {
                    if (!CountsCompatibleForCacheSkip(localCounts, remoteCounts, hasEmpresaPoste, hasTransformadores, hasCenso))
                    {
                        throw new InvalidOperationException(
                            "A versao NEON esta igual, mas a contagem das tabelas mudou.\n\n" +
                            "Isso costuma acontecer apos TRUNCATE/alteracao manual feita antes do controle de TRUNCATE. " +
                            "Para evitar custo alto no NEON, o app nao vai baixar a base completa automaticamente. " +
                            "Se a tabela remota estiver zerada, a limpeza local ja e aplicada automaticamente; para outras divergencias, use reimportacao completa manual.");
                    }

                    Report("cache", "Base NEON sem alteracoes. Usando SQLite/cache local...");
                    await EnsureLocalMapCacheAsync(Report, cancellationToken).ConfigureAwait(false);

                    var cachedMsg =
                        $"Base NEON sem alteracoes. Nenhuma tabela foi baixada; SQLite local mantido em cache. " +
                        $"versao={remoteDatasetVersion.Version}, postes={localCounts.Postes:n0}, empresas={localCounts.Empresas:n0}, transformadores={localCounts.Transformadores:n0}, censo={localCounts.Censo:n0}.";
                    _logs.LogInfo(cachedMsg);
                    return new NeonSyncResult(localCounts.Postes, localCounts.Empresas, localCounts.Transformadores, localCounts.Censo, cachedMsg);
                }

                if (previousDatasetVersion.Value < remoteDatasetVersion.Version)
                {
                    return await SyncDeltaAsync(
                        pg,
                        hasEmpresaPoste,
                        hasTransformadores,
                        hasCenso,
                        latSql,
                        lonSql,
                        previousDatasetVersion.Value,
                        remoteDatasetVersion,
                        Report,
                        cancellationToken).ConfigureAwait(false);
                }

                await _db.SetSyncStateAsync(
                    NeonDatasetVersionStateKey,
                    remoteDatasetVersion.Version.ToString(CultureInfo.InvariantCulture),
                    cancellationToken).ConfigureAwait(false);

                Report("cache", "Versao local maior que a versao remota. Mantendo SQLite/cache local...");
                await EnsureLocalMapCacheAsync(Report, cancellationToken).ConfigureAwait(false);
                return new NeonSyncResult(
                    localCounts.Postes,
                    localCounts.Empresas,
                    localCounts.Transformadores,
                    localCounts.Censo,
                    $"Base local mantida em cache. Versao NEON ajustada para {remoteDatasetVersion.Version}; nenhuma tabela foi baixada.");
            }

            // Totais para barra de progresso (pode levar alguns segundos no Postgres).
            Report("connect", "Lendo totais do NEON…");
            var remoteManifest = await BuildRemoteManifestAsync(
                pg,
                hasEmpresaPoste,
                hasTransformadores,
                hasCenso,
                cancellationToken).ConfigureAwait(false);

            var totalPostes = remoteManifest.TotalPostes;
            var totalEmpresas = remoteManifest.TotalEmpresas;
            var totalTransformadores = remoteManifest.TotalTransformadores;
            var totalCenso = remoteManifest.TotalCenso;

            var localPostes = localCounts.Postes;
            var previousManifest = await _db.GetSyncStateAsync(RemoteManifestStateKey, cancellationToken).ConfigureAwait(false);

            if (mode == ImportService.ImportMode.Upsert &&
                localPostes > 0 &&
                string.IsNullOrWhiteSpace(previousManifest) &&
                localPostes == totalPostes)
            {
                await _db.SetSyncStateAsync(RemoteManifestStateKey, remoteManifest.Signature, cancellationToken).ConfigureAwait(false);
                Report("cache", "Base local existente compativel com o NEON. Manifesto inicial gravado sem baixar tabelas...");

                try
                {
                    var cacheProgress = new Progress<DatabaseService.PostesLightCacheBuildProgress>(p =>
                    {
                        if (p is null) return;
                        Report("cache", p.Message, p.Current, p.Total);
                    });
                    await _db.EnsurePostesLightCacheAsync(cacheProgress, cancellationToken).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    _logs.LogError("Falha ao conferir cache local apos gravar manifesto inicial.", ex);
                }

                var seededMsg =
                    $"Base local existente compativel com o NEON. Manifesto inicial salvo; nenhuma tabela foi baixada. " +
                    $"postes={totalPostes:n0}, empresas={totalEmpresas:n0}, transformadores={totalTransformadores:n0}, censo={totalCenso:n0}.";
                _logs.LogInfo(seededMsg);
                return new NeonSyncResult(totalPostes, totalEmpresas, totalTransformadores, totalCenso, seededMsg);
            }

            if (mode == ImportService.ImportMode.Upsert &&
                localPostes > 0 &&
                string.Equals(previousManifest, remoteManifest.Signature, StringComparison.Ordinal))
            {
                Report("cache", "Base NEON sem alteracoes. Usando SQLite/cache local...");

                try
                {
                    var cacheProgress = new Progress<DatabaseService.PostesLightCacheBuildProgress>(p =>
                    {
                        if (p is null) return;
                        Report("cache", p.Message, p.Current, p.Total);
                    });
                    await _db.EnsurePostesLightCacheAsync(cacheProgress, cancellationToken).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    _logs.LogError("Falha ao conferir cache local apos manifesto NEON sem alteracoes.", ex);
                }

                var cachedMsg =
                    $"Base NEON sem alteracoes. Nenhuma tabela foi baixada; SQLite local mantido em cache. " +
                    $"postes={totalPostes:n0}, empresas={totalEmpresas:n0}, transformadores={totalTransformadores:n0}, censo={totalCenso:n0}.";
                _logs.LogInfo(cachedMsg);
                return new NeonSyncResult(totalPostes, totalEmpresas, totalTransformadores, totalCenso, cachedMsg);
            }

            if (mode == ImportService.ImportMode.Upsert && localPostes > 0)
            {
                Report("download", "Base NEON mudou. Atualizando SQLite local...", 0, totalPostes);
            }

            Report("sqlite", "Atualizando SQLite local…");
            await using var sqlite = _db.OpenConnection();
            await sqlite.OpenAsync(cancellationToken).ConfigureAwait(false);

            // IMPORTAÇÃO: `PRAGMA foreign_keys` é NO-OP dentro de transação (autocommit OFF).
            // Portanto, precisamos desabilitar enforcement ANTES do BEGIN, senão um único órfão
            // em empresa_poste aborta a sincronização inteira com "FOREIGN KEY constraint failed".
            await using (var pragmaOff = sqlite.CreateCommand())
            {
                pragmaOff.CommandText = "PRAGMA foreign_keys=OFF;";
                await pragmaOff.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
            }

            await using var tx = (SqliteTransaction)await sqlite.BeginTransactionAsync(cancellationToken).ConfigureAwait(false);

            if (mode == ImportService.ImportMode.Replace)
            {
                await ExecSqliteAsync(sqlite, tx, "DELETE FROM empresa_poste;", cancellationToken).ConfigureAwait(false);
                await ExecSqliteAsync(sqlite, tx, "DELETE FROM dados_poste;", cancellationToken).ConfigureAwait(false);
                await ExecSqliteAsync(sqlite, tx, "DELETE FROM transformadores;", cancellationToken).ConfigureAwait(false);
                await ExecSqliteAsync(sqlite, tx, "DELETE FROM censo_municipio;", cancellationToken).ConfigureAwait(false);
            }

            long postes = 0;
            long empresas = 0;
            long transformadores = 0;
            long censo = 0;

            // ---------------- dados_poste ----------------
            Report("postes", "Baixando postes (dados_poste)…", 0, totalPostes);
            var sqlPostes = $"""
                SELECT
                  d.id,
                  d.coordenadas,
                  {latSql} AS lat,
                  {lonSql} AS lon,
                  d.nome_municipio,
                  d.nome_bairro,
                  d.nome_logradouro,
                  d.material,
                  d.altura,
                  d.tensao_mecanica,
                  row_to_json(d)::text AS payload_json
                FROM dados_poste d
                """;

            await using (var cmd = new NpgsqlCommand(sqlPostes, pg))
            {
                cmd.CommandTimeout = 0;
                await using var reader = await cmd.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);

                await using var cmdPoste = sqlite.CreateCommand();
                cmdPoste.Transaction = tx;
                cmdPoste.CommandText = """
                    INSERT INTO dados_poste
                      (id, coordenadas, lat, lon, nome_municipio, nome_bairro, nome_logradouro, material, altura, tensao_mecanica, qtd_empresas, payload_json)
                    VALUES
                      (@id, @coordenadas, @lat, @lon, @municipio, @bairro, @logradouro, @material, @altura, @tensao, 0, @payload_json)
                    ON CONFLICT(id) DO UPDATE SET
                      coordenadas = excluded.coordenadas,
                      lat = excluded.lat,
                      lon = excluded.lon,
                      nome_municipio = excluded.nome_municipio,
                      nome_bairro = excluded.nome_bairro,
                      nome_logradouro = excluded.nome_logradouro,
                      material = excluded.material,
                      altura = excluded.altura,
                      tensao_mecanica = excluded.tensao_mecanica,
                      payload_json = excluded.payload_json;
                    """;
                cmdPoste.Parameters.Add(new SqliteParameter("@id", SqliteType.Integer));
                cmdPoste.Parameters.Add(new SqliteParameter("@coordenadas", SqliteType.Text));
                cmdPoste.Parameters.Add(new SqliteParameter("@lat", SqliteType.Real));
                cmdPoste.Parameters.Add(new SqliteParameter("@lon", SqliteType.Real));
                cmdPoste.Parameters.Add(new SqliteParameter("@municipio", SqliteType.Text));
                cmdPoste.Parameters.Add(new SqliteParameter("@bairro", SqliteType.Text));
                cmdPoste.Parameters.Add(new SqliteParameter("@logradouro", SqliteType.Text));
                cmdPoste.Parameters.Add(new SqliteParameter("@material", SqliteType.Text));
                cmdPoste.Parameters.Add(new SqliteParameter("@altura", SqliteType.Real));
                cmdPoste.Parameters.Add(new SqliteParameter("@tensao", SqliteType.Text));
                cmdPoste.Parameters.Add(new SqliteParameter("@payload_json", SqliteType.Text));
                cmdPoste.Prepare();

                var lastUi = DateTime.UtcNow;
                while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
                {
                    cancellationToken.ThrowIfCancellationRequested();

                    // No NEON, `dados_poste.id` pode vir como `bigint` OU `text` (dependendo do schema/migração).
                    // Para manter compatibilidade com o front atual (que usa IDs numéricos), normalizamos extraindo dígitos.
                    var idRaw = reader.IsDBNull(0) ? "" : reader.GetValue(0)?.ToString() ?? "";
                    if (!long.TryParse(OnlyDigits(idRaw), NumberStyles.Integer, CultureInfo.InvariantCulture, out var id) || id <= 0)
                        continue;

                    var coord = reader.IsDBNull(1) ? null : reader.GetValue(1)?.ToString();
                    var latIn = ReadAsDoubleOrNull(reader, 2);
                    var lonIn = ReadAsDoubleOrNull(reader, 3);
                    var (lat, lon, coordNorm) = NormalizeCoords(latIn, lonIn, coord);

                    cmdPoste.Parameters["@id"].Value = id;
                    cmdPoste.Parameters["@coordenadas"].Value = (object?)NullIfEmpty(coordNorm) ?? DBNull.Value;
                    cmdPoste.Parameters["@lat"].Value = (object?)lat ?? DBNull.Value;
                    cmdPoste.Parameters["@lon"].Value = (object?)lon ?? DBNull.Value;
                    cmdPoste.Parameters["@municipio"].Value = (object?)NullIfEmpty(reader.IsDBNull(4) ? null : reader.GetValue(4)?.ToString()) ?? DBNull.Value;
                    cmdPoste.Parameters["@bairro"].Value = (object?)NullIfEmpty(reader.IsDBNull(5) ? null : reader.GetValue(5)?.ToString()) ?? DBNull.Value;
                    cmdPoste.Parameters["@logradouro"].Value = (object?)NullIfEmpty(reader.IsDBNull(6) ? null : reader.GetValue(6)?.ToString()) ?? DBNull.Value;
                    cmdPoste.Parameters["@material"].Value = (object?)NullIfEmpty(reader.IsDBNull(7) ? null : reader.GetValue(7)?.ToString()) ?? DBNull.Value;
                    cmdPoste.Parameters["@altura"].Value = (object?)ReadAsDoubleOrNull(reader, 8) ?? DBNull.Value;
                    cmdPoste.Parameters["@tensao"].Value = (object?)NullIfEmpty(reader.IsDBNull(9) ? null : reader.GetValue(9)?.ToString()) ?? DBNull.Value;
                    cmdPoste.Parameters["@payload_json"].Value = (object?)NullIfEmpty(reader.IsDBNull(10) ? null : reader.GetValue(10)?.ToString()) ?? DBNull.Value;

                    await cmdPoste.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
                    postes++;

                    if ((DateTime.UtcNow - lastUi).TotalMilliseconds > 400)
                    {
                        lastUi = DateTime.UtcNow;
                        Report("postes", $"Importando postes… {postes:n0}/{totalPostes:n0}", postes, totalPostes);
                    }
                }
            }

        // ---------------- empresa_poste ----------------
        if (hasEmpresaPoste)
        {
            Report("empresas", "Baixando empresas (empresa_poste)…", 0, totalEmpresas);
            await using var cmd = new NpgsqlCommand("""
                SELECT ep.id_poste, ep.empresa, ep.id_insercao
                FROM empresa_poste ep
                """, pg)
            {
                CommandTimeout = 0
            };
            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);

            await using var cmdEmpresa = sqlite.CreateCommand();
            cmdEmpresa.Transaction = tx;
            cmdEmpresa.CommandText = """
                INSERT OR IGNORE INTO empresa_poste (id_poste, empresa, id_insercao)
                SELECT @id_poste, @empresa, @id_insercao
                WHERE EXISTS (SELECT 1 FROM dados_poste WHERE id = @id_poste);
                """;
            cmdEmpresa.Parameters.Add(new SqliteParameter("@id_poste", SqliteType.Integer));
            cmdEmpresa.Parameters.Add(new SqliteParameter("@empresa", SqliteType.Text));
            cmdEmpresa.Parameters.Add(new SqliteParameter("@id_insercao", SqliteType.Text));
            cmdEmpresa.Prepare();

            var lastUi = DateTime.UtcNow;
            while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                cancellationToken.ThrowIfCancellationRequested();

                var idPosteRaw = reader.IsDBNull(0) ? "" : reader.GetValue(0)?.ToString() ?? "";
                if (!long.TryParse(OnlyDigits(idPosteRaw), NumberStyles.Integer, CultureInfo.InvariantCulture, out var idPoste) || idPoste <= 0)
                    continue;

                var empresa = reader.IsDBNull(1) ? "" : (reader.GetValue(1)?.ToString() ?? "");
                if (string.IsNullOrWhiteSpace(empresa)) continue;
                if (empresa.Trim().Equals("DISPONÍVEL", StringComparison.OrdinalIgnoreCase)) continue;

                var idInsercao = reader.IsDBNull(2) ? null : reader.GetValue(2)?.ToString();

                cmdEmpresa.Parameters["@id_poste"].Value = idPoste;
                cmdEmpresa.Parameters["@empresa"].Value = empresa.Trim();
                cmdEmpresa.Parameters["@id_insercao"].Value = (object?)NullIfEmpty(idInsercao) ?? DBNull.Value;

                var n = await cmdEmpresa.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
                if (n > 0) empresas += n;

                if ((DateTime.UtcNow - lastUi).TotalMilliseconds > 400)
                {
                    lastUi = DateTime.UtcNow;
                    Report("empresas", $"Importando empresas… {empresas:n0}/{totalEmpresas:n0}", empresas, totalEmpresas);
                }
            }
        }

        // ---------------- transformadores ----------------
        if (hasTransformadores)
        {
            Report("transformadores", "Baixando transformadores…", 0, totalTransformadores);
            await using var cmd = new NpgsqlCommand("SELECT row_to_json(t) FROM transformadores t", pg)
            {
                CommandTimeout = 0
            };
            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);

            await using var cmdIns = sqlite.CreateCommand();
            cmdIns.Transaction = tx;
            cmdIns.CommandText = "INSERT INTO transformadores (payload_json) VALUES (@json);";
            cmdIns.Parameters.Add(new SqliteParameter("@json", SqliteType.Text));
            cmdIns.Prepare();

            var lastUi = DateTime.UtcNow;
            while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                cancellationToken.ThrowIfCancellationRequested();
                var json = reader.IsDBNull(0) ? null : reader.GetValue(0)?.ToString();
                if (string.IsNullOrWhiteSpace(json)) continue;
                cmdIns.Parameters["@json"].Value = json;
                await cmdIns.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
                transformadores++;

                if ((DateTime.UtcNow - lastUi).TotalMilliseconds > 800)
                {
                    lastUi = DateTime.UtcNow;
                    Report("transformadores", $"Importando transformadores… {transformadores:n0}/{totalTransformadores:n0}", transformadores, totalTransformadores);
                }
            }
        }

        // ---------------- censo_municipio ----------------
        if (hasCenso)
        {
            Report("censo", "Baixando censo…", 0, totalCenso);
            await using var cmd = new NpgsqlCommand("SELECT poste FROM censo_municipio", pg)
            {
                CommandTimeout = 0
            };
            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);

            await using var cmdIns = sqlite.CreateCommand();
            cmdIns.Transaction = tx;
            cmdIns.CommandText = "INSERT INTO censo_municipio (poste) VALUES (@poste);";
            cmdIns.Parameters.Add(new SqliteParameter("@poste", SqliteType.Text));
            cmdIns.Prepare();

            var lastUi = DateTime.UtcNow;
            while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                cancellationToken.ThrowIfCancellationRequested();
                var poste = reader.IsDBNull(0) ? null : reader.GetValue(0)?.ToString();
                if (string.IsNullOrWhiteSpace(poste)) continue;
                cmdIns.Parameters["@poste"].Value = poste.Trim();
                await cmdIns.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
                censo++;

                if ((DateTime.UtcNow - lastUi).TotalMilliseconds > 800)
                {
                    lastUi = DateTime.UtcNow;
                    Report("censo", $"Importando censo… {censo:n0}/{totalCenso:n0}", censo, totalCenso);
                }
            }
        }

        // Remove qualquer registro órfão antes de finalizar.
        await ExecSqliteAsync(sqlite, tx, """
            DELETE FROM empresa_poste
            WHERE id_poste NOT IN (SELECT id FROM dados_poste);
            """, cancellationToken).ConfigureAwait(false);

        Report("counts", "Recalculando quantidade de empresas por poste…");
        await RebuildQtdEmpresasAsync(sqlite, tx, cancellationToken).ConfigureAwait(false);

        await tx.CommitAsync(cancellationToken).ConfigureAwait(false);

        // Restaura enforcement para o restante da sessão (fora da transação, senão é NO-OP).
        await using (var pragmaOn = sqlite.CreateCommand())
        {
            pragmaOn.CommandText = "PRAGMA foreign_keys=ON;";
            await pragmaOn.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }

            // Gera um cache compacto para visualização "base completa" no mapa.
            // Isso permite carregar ~600k+ pontos de uma vez sem criar 600k+ markers (que travaria o WebView2).
            try
            {
                Report("cache", "Gerando cache de visualização (base completa)…");
                var datasetVersion = await _db.BumpDatasetVersionAsync(cancellationToken).ConfigureAwait(false);

                var cacheProgress = new Progress<DatabaseService.PostesLightCacheBuildProgress>(p =>
                {
                    if (p is null) return;
                    Report("cache", p.Message, p.Current, p.Total);
                });

                var cache = await _db.BuildPostesLightCacheAsync(datasetVersion, cacheProgress, cancellationToken).ConfigureAwait(false);
                _logs.LogInfo($"Cache de visualização gerado: {cache.RecordsWritten:n0} pontos.");
            }
            catch (Exception ex)
            {
                // NÃ£o falha a sincronizaÃ§Ã£o se o cache falhar. O app ainda funciona (fallback: modo viewport).
                _logs.LogError("Falha ao gerar cache de visualização.", ex);
            }

            await _db.SetSyncStateAsync(RemoteManifestStateKey, remoteManifest.Signature, cancellationToken).ConfigureAwait(false);
            if (remoteDatasetVersion is not null)
            {
                await _db.SetSyncStateAsync(
                    NeonDatasetVersionStateKey,
                    remoteDatasetVersion.Version.ToString(CultureInfo.InvariantCulture),
                    cancellationToken).ConfigureAwait(false);
            }

            var msg = $"NEON sincronizado: postes={postes:n0}, empresas={empresas:n0}, transformadores={transformadores:n0}, censo={censo:n0}.";
            _logs.LogInfo(msg);
            return new NeonSyncResult(postes, empresas, transformadores, censo, msg);
        }
        catch (Exception ex)
        {
            _logs.LogError("Erro durante sincronização do NEON.", ex);
            throw;
        }
        finally
        {
            _mutex.Release();
        }
    }

    public static string NormalizeNeonConnectionString(string? input)
    {
        var raw = (input ?? "").Trim();
        if (string.IsNullOrWhiteSpace(raw))
            throw new InvalidOperationException("Informe a connection string do NEON.");

        // Usuário costuma colar:
        // - URL completa (postgresql://user:pass@host/db?sslmode=require&channel_binding=require)
        // - Comando psql: psql 'postgresql://...'
        // - Variável de ambiente: DATABASE_URL="postgresql://..."
        // - Às vezes, com aspas simples/duplas ao redor
        raw = ExtractPostgresUrlIfEmbedded(raw);
        raw = TrimOuterQuotes(raw);

        // Já está em formato ADO.NET (keyword=value; ...)
        if (raw.Contains('=') &&
            !raw.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase) &&
            !raw.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase))
        {
            return raw;
        }

        // Se colou apenas host/path (sem esquema), tenta prefixar.
        if (!raw.Contains("://") && raw.Contains(".neon.", StringComparison.OrdinalIgnoreCase))
        {
            raw = "postgresql://" + raw;
        }

        if (!raw.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase) &&
            !raw.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                "Connection string inválida.\n\n" +
                "Cole a URL completa do NEON, por exemplo:\n" +
                "postgresql://USER:PASSWORD@HOST/DB?sslmode=require&channel_binding=require\n\n" +
                "Dica: você pode colar também o comando `psql 'postgresql://...'` ou uma linha `DATABASE_URL=\"postgresql://...\"`."
            );
        }

        if (!Uri.TryCreate(raw, UriKind.Absolute, out var uri))
        {
            throw new InvalidOperationException(
                "Não foi possível interpretar a URL do NEON.\n\n" +
                "Verifique se ela começa com postgresql:// ou postgres:// e se não está incompleta."
            );
        }

        var database = (uri.AbsolutePath ?? "").Trim('/');
        if (string.IsNullOrWhiteSpace(database))
            throw new InvalidOperationException("A URL do NEON não contém o nome do banco (path). Ex.: ...neon.tech/neondb?... ");

        var user = "";
        var pass = "";
        if (!string.IsNullOrWhiteSpace(uri.UserInfo))
        {
            var parts = uri.UserInfo.Split(':', 2);
            user = Uri.UnescapeDataString(parts[0] ?? "");
            pass = parts.Length > 1 ? Uri.UnescapeDataString(parts[1] ?? "") : "";
        }

        if (string.IsNullOrWhiteSpace(user) || string.IsNullOrWhiteSpace(pass))
        {
            throw new InvalidOperationException("A URL do NEON precisa conter usuário e senha (antes do @). Copie a URL completa pelo botão Connect do NEON.");
        }

        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.IsDefaultPort ? NpgsqlConnection.DefaultPort : uri.Port,
            Database = database,
            Username = user,
            Password = pass,
            // Neon exige TLS (normalmente a URL já vem com sslmode=require).
            SslMode = SslMode.Require
        };

        var query = (uri.Query ?? "").TrimStart('?');
        if (!string.IsNullOrWhiteSpace(query))
        {
            foreach (var kv in query.Split('&', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                var parts = kv.Split('=', 2);
                var key = Uri.UnescapeDataString(parts[0].Trim());
                var valueRaw = parts.Length > 1 ? parts[1] : "";
                // '+' em query-string representa espaço em muitas implementações.
                var value = Uri.UnescapeDataString(valueRaw.Replace("+", "%20")).Trim();

                if (key.Equals("sslmode", StringComparison.OrdinalIgnoreCase))
                {
                    if (value.Equals("require", StringComparison.OrdinalIgnoreCase)) builder.SslMode = SslMode.Require;
                    else if (value.Equals("verify-full", StringComparison.OrdinalIgnoreCase)) builder.SslMode = SslMode.VerifyFull;
                    else if (value.Equals("verify-ca", StringComparison.OrdinalIgnoreCase)) builder.SslMode = SslMode.VerifyCA;
                    else if (value.Equals("prefer", StringComparison.OrdinalIgnoreCase)) builder.SslMode = SslMode.Prefer;
                    else if (value.Equals("disable", StringComparison.OrdinalIgnoreCase)) builder.SslMode = SslMode.Disable;
                }
                else if (key.Equals("channel_binding", StringComparison.OrdinalIgnoreCase) || key.Equals("channelbinding", StringComparison.OrdinalIgnoreCase))
                {
                    if (value.Equals("require", StringComparison.OrdinalIgnoreCase)) builder.ChannelBinding = ChannelBinding.Require;
                    else if (value.Equals("prefer", StringComparison.OrdinalIgnoreCase)) builder.ChannelBinding = ChannelBinding.Prefer;
                    else if (value.Equals("disable", StringComparison.OrdinalIgnoreCase)) builder.ChannelBinding = ChannelBinding.Disable;
                }
                else if (key.Equals("options", StringComparison.OrdinalIgnoreCase))
                {
                    // Neon às vezes inclui options=endpoint%3D...
                    builder.Options = value;
                }
            }
        }

        return builder.ConnectionString;
    }

    private async Task EnsureLocalMapCacheAsync(
        Action<string, string, long, long> report,
        CancellationToken cancellationToken)
    {
        try
        {
            var cacheProgress = new Progress<DatabaseService.PostesLightCacheBuildProgress>(p =>
            {
                if (p is null) return;
                report("cache", p.Message, p.Current, p.Total);
            });
            await _db.EnsurePostesLightCacheAsync(cacheProgress, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logs.LogError("Falha ao conferir cache local da base de postes.", ex);
        }
    }

    private static async Task<NeonRemoteCounts> ReadRemoteDataCountsAsync(
        NpgsqlConnection cn,
        bool hasEmpresaPoste,
        bool hasTransformadores,
        bool hasCenso,
        CancellationToken ct)
    {
        return new NeonRemoteCounts(
            Postes: await CountRowsAsync(cn, "dados_poste", ct).ConfigureAwait(false),
            Empresas: hasEmpresaPoste ? await CountRowsAsync(cn, "empresa_poste", ct).ConfigureAwait(false) : 0,
            Transformadores: hasTransformadores ? await CountRowsAsync(cn, "transformadores", ct).ConfigureAwait(false) : 0,
            Censo: hasCenso ? await CountRowsAsync(cn, "censo_municipio", ct).ConfigureAwait(false) : 0);
    }

    private async Task<NeonSyncResult?> TryApplyRemoteEmptyTablesAsync(
        NeonRemoteCounts remoteCounts,
        DatabaseService.LocalDataCounts localCounts,
        bool hasEmpresaPoste,
        bool hasTransformadores,
        bool hasCenso,
        NeonDatasetVersion? remoteDatasetVersion,
        Action<string, string, long, long> report,
        CancellationToken cancellationToken)
    {
        var clearPostes = remoteCounts.Postes == 0 && localCounts.Postes > 0;
        var clearEmpresas = hasEmpresaPoste && remoteCounts.Empresas == 0 && localCounts.Empresas > 0;
        var clearTransformadores = hasTransformadores && remoteCounts.Transformadores == 0 && localCounts.Transformadores > 0;
        var clearCenso = hasCenso && remoteCounts.Censo == 0 && localCounts.Censo > 0;

        if (!clearPostes && !clearEmpresas && !clearTransformadores && !clearCenso)
            return null;

        report("sqlite", "NEON indica tabela vazia. Limpando SQLite local sem baixar registros...", 0, 0);

        await using var sqlite = _db.OpenConnection();
        await sqlite.OpenAsync(cancellationToken).ConfigureAwait(false);

        await using (var pragmaOff = sqlite.CreateCommand())
        {
            pragmaOff.CommandText = "PRAGMA foreign_keys=OFF;";
            await pragmaOff.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }

        await using var tx = (SqliteTransaction)await sqlite.BeginTransactionAsync(cancellationToken).ConfigureAwait(false);

        if (clearPostes)
        {
            await ExecSqliteAsync(sqlite, tx, "DELETE FROM empresa_poste;", cancellationToken).ConfigureAwait(false);
            await ExecSqliteAsync(sqlite, tx, "DELETE FROM dados_poste;", cancellationToken).ConfigureAwait(false);
        }
        else if (clearEmpresas)
        {
            await ExecSqliteAsync(sqlite, tx, "DELETE FROM empresa_poste;", cancellationToken).ConfigureAwait(false);
        }

        if (clearTransformadores)
            await ExecSqliteAsync(sqlite, tx, "DELETE FROM transformadores;", cancellationToken).ConfigureAwait(false);

        if (clearCenso)
            await ExecSqliteAsync(sqlite, tx, "DELETE FROM censo_municipio;", cancellationToken).ConfigureAwait(false);

        await RebuildQtdEmpresasAsync(sqlite, tx, cancellationToken).ConfigureAwait(false);
        await tx.CommitAsync(cancellationToken).ConfigureAwait(false);

        await using (var pragmaOn = sqlite.CreateCommand())
        {
            pragmaOn.CommandText = "PRAGMA foreign_keys=ON;";
            await pragmaOn.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }

        try
        {
            report("cache", "Atualizando cache local apos limpeza...", 0, 0);
            var datasetVersion = await _db.BumpDatasetVersionAsync(cancellationToken).ConfigureAwait(false);
            var cacheProgress = new Progress<DatabaseService.PostesLightCacheBuildProgress>(p =>
            {
                if (p is null) return;
                report("cache", p.Message, p.Current, p.Total);
            });
            await _db.BuildPostesLightCacheAsync(datasetVersion, cacheProgress, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logs.LogError("Falha ao atualizar cache local apos limpeza por tabela vazia no NEON.", ex);
        }

        if (remoteDatasetVersion is not null)
        {
            await _db.SetSyncStateAsync(
                NeonDatasetVersionStateKey,
                remoteDatasetVersion.Version.ToString(CultureInfo.InvariantCulture),
                cancellationToken).ConfigureAwait(false);
        }

        var counts = await _db.GetLocalDataCountsAsync(cancellationToken).ConfigureAwait(false);
        var msg =
            "SQLite local atualizado por estado vazio no NEON sem baixar registros. " +
            $"postes={counts.Postes:n0}, empresas={counts.Empresas:n0}, transformadores={counts.Transformadores:n0}, censo={counts.Censo:n0}.";
        _logs.LogInfo(msg);
        return new NeonSyncResult(counts.Postes, counts.Empresas, counts.Transformadores, counts.Censo, msg);
    }

    private static bool CountsCompatibleForCacheSkip(
        DatabaseService.LocalDataCounts localCounts,
        NeonRemoteCounts remoteCounts,
        bool hasEmpresaPoste,
        bool hasTransformadores,
        bool hasCenso)
    {
        return localCounts.Postes == remoteCounts.Postes &&
               (!hasEmpresaPoste || localCounts.Empresas == remoteCounts.Empresas) &&
               (!hasTransformadores || localCounts.Transformadores == remoteCounts.Transformadores) &&
               (!hasCenso || localCounts.Censo == remoteCounts.Censo);
    }

    private async Task EnsureNeonSyncControlAsync(
        NpgsqlConnection cn,
        bool hasEmpresaPoste,
        bool hasTransformadores,
        bool hasCenso,
        CancellationToken ct)
    {
        await ExecPostgresAsync(cn, """
            CREATE SEQUENCE IF NOT EXISTS public.conecta_poste_row_version_seq;

            CREATE TABLE IF NOT EXISTS public.conecta_poste_dataset_version (
              id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
              version bigint NOT NULL DEFAULT 1,
              changed_at timestamptz NOT NULL DEFAULT now(),
              reason text NULL
            );

            INSERT INTO public.conecta_poste_dataset_version (id, version, changed_at, reason)
            VALUES (1, GREATEST(1, nextval('public.conecta_poste_row_version_seq')), now(), 'sync-control-created')
            ON CONFLICT (id) DO NOTHING;

            CREATE TABLE IF NOT EXISTS public.conecta_poste_tombstone (
              id bigserial PRIMARY KEY,
              version bigint NOT NULL,
              table_name text NOT NULL,
              row_key text NOT NULL,
              owner_key text NULL,
              op char(1) NOT NULL DEFAULT 'D',
              changed_at timestamptz NOT NULL DEFAULT now()
            );

            CREATE INDEX IF NOT EXISTS idx_conecta_tombstone_version
              ON public.conecta_poste_tombstone(version);
            CREATE INDEX IF NOT EXISTS idx_conecta_tombstone_table_version
              ON public.conecta_poste_tombstone(table_name, version);
            CREATE INDEX IF NOT EXISTS idx_conecta_tombstone_owner
              ON public.conecta_poste_tombstone(table_name, owner_key);

            CREATE OR REPLACE FUNCTION public.conecta_poste_next_dataset_version(p_reason text)
            RETURNS bigint
            LANGUAGE plpgsql
            AS $$
            DECLARE
              v bigint;
            BEGIN
              v := nextval('public.conecta_poste_row_version_seq');

              INSERT INTO public.conecta_poste_dataset_version (id, version, changed_at, reason)
              VALUES (1, v, now(), p_reason)
              ON CONFLICT (id) DO UPDATE SET
                version = EXCLUDED.version,
                changed_at = EXCLUDED.changed_at,
                reason = EXCLUDED.reason;

              RETURN v;
            END;
            $$;

            CREATE OR REPLACE FUNCTION public.conecta_poste_touch_truncate()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $$
            DECLARE
              v bigint;
            BEGIN
              v := public.conecta_poste_next_dataset_version(TG_TABLE_NAME || ':TRUNCATE');

              INSERT INTO public.conecta_poste_tombstone(version, table_name, row_key, owner_key, op, changed_at)
              VALUES (v, TG_TABLE_NAME, '*', '*', 'T', now());

              RETURN NULL;
            END;
            $$;
            """, ct).ConfigureAwait(false);

        await EnsureSyncColumnAndIndexAsync(cn, "dados_poste", ct).ConfigureAwait(false);
        await ExecPostgresAsync(cn, """
            CREATE OR REPLACE FUNCTION public.conecta_poste_touch_dados_poste()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $$
            DECLARE
              v bigint;
            BEGIN
              v := public.conecta_poste_next_dataset_version('dados_poste:' || TG_OP);

              IF TG_OP = 'DELETE' THEN
                INSERT INTO public.conecta_poste_tombstone(version, table_name, row_key, owner_key, op, changed_at)
                VALUES (v, 'dados_poste', OLD.id::text, OLD.id::text, 'D', now());
                RETURN OLD;
              END IF;

              NEW.conecta_sync_version := v;
              RETURN NEW;
            END;
            $$;

            DROP TRIGGER IF EXISTS trg_conecta_poste_sync_dados ON public.dados_poste;
            CREATE TRIGGER trg_conecta_poste_sync_dados
            BEFORE INSERT OR UPDATE OR DELETE ON public.dados_poste
            FOR EACH ROW EXECUTE FUNCTION public.conecta_poste_touch_dados_poste();

            DROP TRIGGER IF EXISTS trg_conecta_poste_truncate_dados ON public.dados_poste;
            CREATE TRIGGER trg_conecta_poste_truncate_dados
            AFTER TRUNCATE ON public.dados_poste
            FOR EACH STATEMENT EXECUTE FUNCTION public.conecta_poste_touch_truncate();
            """, ct).ConfigureAwait(false);

        if (hasEmpresaPoste &&
            await ColumnExistsAsync(cn, "empresa_poste", "id_poste", ct).ConfigureAwait(false) &&
            await ColumnExistsAsync(cn, "empresa_poste", "empresa", ct).ConfigureAwait(false))
        {
            await EnsureSyncColumnAndIndexAsync(cn, "empresa_poste", ct).ConfigureAwait(false);
            var empresaKeyExpression = await ColumnExistsAsync(cn, "empresa_poste", "id_insercao", ct).ConfigureAwait(false)
                ? "COALESCE(OLD.id_insercao::text, OLD.id_poste::text || ':' || COALESCE(OLD.empresa::text, ''))"
                : "OLD.id_poste::text || ':' || COALESCE(OLD.empresa::text, '')";

            await ExecPostgresAsync(cn, $"""
                CREATE OR REPLACE FUNCTION public.conecta_poste_touch_empresa_poste()
                RETURNS trigger
                LANGUAGE plpgsql
                AS $$
                DECLARE
                  v bigint;
                BEGIN
                  v := public.conecta_poste_next_dataset_version('empresa_poste:' || TG_OP);

                  IF TG_OP = 'DELETE' THEN
                    INSERT INTO public.conecta_poste_tombstone(version, table_name, row_key, owner_key, op, changed_at)
                    VALUES (v, 'empresa_poste', {empresaKeyExpression}, OLD.id_poste::text, 'D', now());
                    RETURN OLD;
                  END IF;

                  NEW.conecta_sync_version := v;
                  RETURN NEW;
                END;
                $$;

                DROP TRIGGER IF EXISTS trg_conecta_poste_sync_empresa ON public.empresa_poste;
                CREATE TRIGGER trg_conecta_poste_sync_empresa
                BEFORE INSERT OR UPDATE OR DELETE ON public.empresa_poste
                FOR EACH ROW EXECUTE FUNCTION public.conecta_poste_touch_empresa_poste();

                DROP TRIGGER IF EXISTS trg_conecta_poste_truncate_empresa ON public.empresa_poste;
                CREATE TRIGGER trg_conecta_poste_truncate_empresa
                AFTER TRUNCATE ON public.empresa_poste
                FOR EACH STATEMENT EXECUTE FUNCTION public.conecta_poste_touch_truncate();
                """, ct).ConfigureAwait(false);
        }

        if (hasTransformadores)
        {
            await EnsureSyncColumnAndIndexAsync(cn, "transformadores", ct).ConfigureAwait(false);
            var transformadorKeyExpression = await ColumnExistsAsync(cn, "transformadores", "id", ct).ConfigureAwait(false)
                ? "OLD.id::text"
                : "OLD.ctid::text";

            await ExecPostgresAsync(cn, $"""
                CREATE OR REPLACE FUNCTION public.conecta_poste_touch_transformadores()
                RETURNS trigger
                LANGUAGE plpgsql
                AS $$
                DECLARE
                  v bigint;
                BEGIN
                  v := public.conecta_poste_next_dataset_version('transformadores:' || TG_OP);

                  IF TG_OP = 'DELETE' THEN
                    INSERT INTO public.conecta_poste_tombstone(version, table_name, row_key, owner_key, op, changed_at)
                    VALUES (v, 'transformadores', {transformadorKeyExpression}, {transformadorKeyExpression}, 'D', now());
                    RETURN OLD;
                  END IF;

                  NEW.conecta_sync_version := v;
                  RETURN NEW;
                END;
                $$;

                DROP TRIGGER IF EXISTS trg_conecta_poste_sync_transformadores ON public.transformadores;
                CREATE TRIGGER trg_conecta_poste_sync_transformadores
                BEFORE INSERT OR UPDATE OR DELETE ON public.transformadores
                FOR EACH ROW EXECUTE FUNCTION public.conecta_poste_touch_transformadores();

                DROP TRIGGER IF EXISTS trg_conecta_poste_truncate_transformadores ON public.transformadores;
                CREATE TRIGGER trg_conecta_poste_truncate_transformadores
                AFTER TRUNCATE ON public.transformadores
                FOR EACH STATEMENT EXECUTE FUNCTION public.conecta_poste_touch_truncate();
                """, ct).ConfigureAwait(false);
        }

        if (hasCenso && await ColumnExistsAsync(cn, "censo_municipio", "poste", ct).ConfigureAwait(false))
        {
            await EnsureSyncColumnAndIndexAsync(cn, "censo_municipio", ct).ConfigureAwait(false);
            await ExecPostgresAsync(cn, """
                CREATE OR REPLACE FUNCTION public.conecta_poste_touch_censo_municipio()
                RETURNS trigger
                LANGUAGE plpgsql
                AS $$
                DECLARE
                  v bigint;
                BEGIN
                  v := public.conecta_poste_next_dataset_version('censo_municipio:' || TG_OP);

                  IF TG_OP = 'DELETE' THEN
                    INSERT INTO public.conecta_poste_tombstone(version, table_name, row_key, owner_key, op, changed_at)
                    VALUES (v, 'censo_municipio', OLD.poste::text, OLD.poste::text, 'D', now());
                    RETURN OLD;
                  END IF;

                  NEW.conecta_sync_version := v;
                  RETURN NEW;
                END;
                $$;

                DROP TRIGGER IF EXISTS trg_conecta_poste_sync_censo ON public.censo_municipio;
                CREATE TRIGGER trg_conecta_poste_sync_censo
                BEFORE INSERT OR UPDATE OR DELETE ON public.censo_municipio
                FOR EACH ROW EXECUTE FUNCTION public.conecta_poste_touch_censo_municipio();

                DROP TRIGGER IF EXISTS trg_conecta_poste_truncate_censo ON public.censo_municipio;
                CREATE TRIGGER trg_conecta_poste_truncate_censo
                AFTER TRUNCATE ON public.censo_municipio
                FOR EACH STATEMENT EXECUTE FUNCTION public.conecta_poste_touch_truncate();
                """, ct).ConfigureAwait(false);
        }
    }

    private static async Task EnsureSyncColumnAndIndexAsync(NpgsqlConnection cn, string tableName, CancellationToken ct)
    {
        var safeTable = SafeTableName(tableName);
        await ExecPostgresAsync(cn, $"ALTER TABLE public.{safeTable} ADD COLUMN IF NOT EXISTS conecta_sync_version bigint NULL;", ct).ConfigureAwait(false);
        await ExecPostgresAsync(cn, $"CREATE INDEX IF NOT EXISTS idx_{safeTable}_sync_version ON public.{safeTable}(conecta_sync_version);", ct).ConfigureAwait(false);
    }

    private static async Task<NeonDatasetVersion?> ReadNeonDatasetVersionAsync(NpgsqlConnection cn, CancellationToken ct)
    {
        if (!await TableExistsAsync(cn, "conecta_poste_dataset_version", ct).ConfigureAwait(false))
            return null;

        await using var cmd = new NpgsqlCommand("""
            SELECT version, changed_at::text
            FROM public.conecta_poste_dataset_version
            WHERE id = 1
            LIMIT 1;
            """, cn);
        cmd.CommandTimeout = 30;
        await using var reader = await cmd.ExecuteReaderAsync(ct).ConfigureAwait(false);
        if (!await reader.ReadAsync(ct).ConfigureAwait(false))
            return null;

        var version = Convert.ToInt64(reader.GetValue(0), CultureInfo.InvariantCulture);
        var changedAt = reader.IsDBNull(1) ? null : reader.GetValue(1)?.ToString();
        return new NeonDatasetVersion(version, changedAt);
    }

    private async Task<NeonSyncResult> SyncDeltaAsync(
        NpgsqlConnection pg,
        bool hasEmpresaPoste,
        bool hasTransformadores,
        bool hasCenso,
        string latSql,
        string lonSql,
        long previousVersion,
        NeonDatasetVersion remoteVersion,
        Action<string, string, long, long> report,
        CancellationToken cancellationToken)
    {
        report("delta", $"Base NEON mudou. Baixando somente alteracoes v{previousVersion} -> v{remoteVersion.Version}...", 0, 0);

        var truncatedTables = await ReadTruncatedTablesAsync(
            pg,
            previousVersion,
            remoteVersion.Version,
            cancellationToken).ConfigureAwait(false);
        var dadosPosteTruncated = truncatedTables.Contains("dados_poste");
        var empresaPosteTruncated = truncatedTables.Contains("empresa_poste");

        var changedPosteIds = await ReadLongKeysAsync(pg, """
            SELECT id::text
            FROM public.dados_poste
            WHERE conecta_sync_version > @fromVersion
              AND conecta_sync_version <= @toVersion
            ORDER BY conecta_sync_version
            LIMIT @limit;
            """, previousVersion, remoteVersion.Version, MaxDeltaKeysBeforeFullConfirmation + 1, cancellationToken).ConfigureAwait(false);

        var deletedPosteIds = await ReadLongKeysAsync(pg, """
            SELECT row_key
            FROM public.conecta_poste_tombstone
            WHERE table_name = 'dados_poste'
              AND version > @fromVersion
              AND version <= @toVersion
            ORDER BY version
            LIMIT @limit;
            """, previousVersion, remoteVersion.Version, MaxDeltaKeysBeforeFullConfirmation + 1, cancellationToken).ConfigureAwait(false);

        var affectedEmpresaPostIds = hasEmpresaPoste
            ? await ReadLongKeysAsync(pg, """
                SELECT id_poste::text
                FROM public.empresa_poste
                WHERE conecta_sync_version > @fromVersion
                  AND conecta_sync_version <= @toVersion
                UNION
                SELECT owner_key
                FROM public.conecta_poste_tombstone
                WHERE table_name = 'empresa_poste'
                  AND owner_key IS NOT NULL
                  AND version > @fromVersion
                  AND version <= @toVersion
                LIMIT @limit;
                """, previousVersion, remoteVersion.Version, MaxDeltaKeysBeforeFullConfirmation + 1, cancellationToken).ConfigureAwait(false)
            : new List<long>();

        foreach (var id in changedPosteIds)
        {
            if (!affectedEmpresaPostIds.Contains(id))
                affectedEmpresaPostIds.Add(id);
        }

        var totalTouched = changedPosteIds.Count + deletedPosteIds.Count + affectedEmpresaPostIds.Count + truncatedTables.Count;
        if (changedPosteIds.Count > MaxDeltaKeysBeforeFullConfirmation ||
            deletedPosteIds.Count > MaxDeltaKeysBeforeFullConfirmation ||
            affectedEmpresaPostIds.Count > MaxDeltaKeysBeforeFullConfirmation ||
            totalTouched > MaxDeltaKeysBeforeFullConfirmation)
        {
            throw new InvalidOperationException(
                "A atualizacao no NEON e grande demais para sincronizacao delta segura.\n\n" +
                "Para proteger o faturamento do NEON, o Conecta Poste bloqueou o download automatico da base completa. " +
                "Use 'Forcar reimportacao completa' apenas quando realmente quiser reconstruir todo o SQLite local.");
        }

        var transformadoresChanged = hasTransformadores &&
            await HasTableChangesAsync(pg, "transformadores", previousVersion, remoteVersion.Version, cancellationToken).ConfigureAwait(false);
        var censoChanged = hasCenso &&
            await HasTableChangesAsync(pg, "censo_municipio", previousVersion, remoteVersion.Version, cancellationToken).ConfigureAwait(false);

        await using var sqlite = _db.OpenConnection();
        await sqlite.OpenAsync(cancellationToken).ConfigureAwait(false);

        await using (var pragmaOff = sqlite.CreateCommand())
        {
            pragmaOff.CommandText = "PRAGMA foreign_keys=OFF;";
            await pragmaOff.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }

        await using var tx = (SqliteTransaction)await sqlite.BeginTransactionAsync(cancellationToken).ConfigureAwait(false);

        long postes = 0;
        long empresas = 0;
        long transformadores = 0;
        long censo = 0;

        report("delta", $"Aplicando delta local ({totalTouched:n0} chaves)...", 0, Math.Max(totalTouched, 1));
        if (dadosPosteTruncated)
        {
            await ExecSqliteAsync(sqlite, tx, "DELETE FROM empresa_poste;", cancellationToken).ConfigureAwait(false);
            await ExecSqliteAsync(sqlite, tx, "DELETE FROM dados_poste;", cancellationToken).ConfigureAwait(false);
        }
        else
        {
            await DeleteLocalPostesAsync(sqlite, tx, deletedPosteIds, cancellationToken).ConfigureAwait(false);
        }

        if (empresaPosteTruncated && !dadosPosteTruncated)
            await ExecSqliteAsync(sqlite, tx, "DELETE FROM empresa_poste;", cancellationToken).ConfigureAwait(false);

        postes += await UpsertPostesByIdsAsync(pg, sqlite, tx, changedPosteIds, latSql, lonSql, report, cancellationToken).ConfigureAwait(false);

        if (hasEmpresaPoste)
            empresas += await RefreshEmpresasForPostesAsync(pg, sqlite, tx, affectedEmpresaPostIds, report, cancellationToken).ConfigureAwait(false);

        if (transformadoresChanged)
            transformadores = await ReloadTransformadoresAsync(pg, sqlite, tx, report, cancellationToken).ConfigureAwait(false);

        if (censoChanged)
            censo = await ReloadCensoAsync(pg, sqlite, tx, report, cancellationToken).ConfigureAwait(false);

        await ExecSqliteAsync(sqlite, tx, """
            DELETE FROM empresa_poste
            WHERE id_poste NOT IN (SELECT id FROM dados_poste);
            """, cancellationToken).ConfigureAwait(false);

        report("counts", "Recalculando quantidade de empresas por poste...", 0, 0);
        await RebuildQtdEmpresasAsync(sqlite, tx, cancellationToken).ConfigureAwait(false);
        await tx.CommitAsync(cancellationToken).ConfigureAwait(false);

        await using (var pragmaOn = sqlite.CreateCommand())
        {
            pragmaOn.CommandText = "PRAGMA foreign_keys=ON;";
            await pragmaOn.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }

        try
        {
            report("cache", "Gerando cache de visualizacao (base completa)...", 0, 0);
            var datasetVersion = await _db.BumpDatasetVersionAsync(cancellationToken).ConfigureAwait(false);
            var cacheProgress = new Progress<DatabaseService.PostesLightCacheBuildProgress>(p =>
            {
                if (p is null) return;
                report("cache", p.Message, p.Current, p.Total);
            });
            var cache = await _db.BuildPostesLightCacheAsync(datasetVersion, cacheProgress, cancellationToken).ConfigureAwait(false);
            _logs.LogInfo($"Cache de visualizacao gerado apos delta: {cache.RecordsWritten:n0} pontos.");
        }
        catch (Exception ex)
        {
            _logs.LogError("Falha ao gerar cache de visualizacao apos delta.", ex);
        }

        await _db.SetSyncStateAsync(
            NeonDatasetVersionStateKey,
            remoteVersion.Version.ToString(CultureInfo.InvariantCulture),
            cancellationToken).ConfigureAwait(false);

        var counts = await _db.GetLocalDataCountsAsync(cancellationToken).ConfigureAwait(false);
        var msg =
            $"NEON delta sincronizado: postes atualizados={postes:n0}, empresas atualizadas={empresas:n0}, " +
            $"transformadores={(transformadoresChanged ? transformadores.ToString("n0", CultureInfo.CurrentCulture) : "sem alteracao")}, " +
            $"censo={(censoChanged ? censo.ToString("n0", CultureInfo.CurrentCulture) : "sem alteracao")}. " +
            $"Base local: postes={counts.Postes:n0}.";
        _logs.LogInfo(msg);
        return new NeonSyncResult(counts.Postes, counts.Empresas, counts.Transformadores, counts.Censo, msg);
    }

    private static async Task<List<long>> ReadLongKeysAsync(
        NpgsqlConnection cn,
        string sql,
        long fromVersion,
        long toVersion,
        int limit,
        CancellationToken ct)
    {
        var list = new List<long>();
        await using var cmd = new NpgsqlCommand(sql, cn)
        {
            CommandTimeout = 0
        };
        cmd.Parameters.AddWithValue("fromVersion", fromVersion);
        cmd.Parameters.AddWithValue("toVersion", toVersion);
        cmd.Parameters.AddWithValue("limit", limit);

        await using var reader = await cmd.ExecuteReaderAsync(ct).ConfigureAwait(false);
        while (await reader.ReadAsync(ct).ConfigureAwait(false))
        {
            var raw = reader.IsDBNull(0) ? "" : reader.GetValue(0)?.ToString() ?? "";
            if (long.TryParse(OnlyDigits(raw), NumberStyles.Integer, CultureInfo.InvariantCulture, out var id) && id > 0)
                list.Add(id);
        }

        return list.Distinct().ToList();
    }

    private static async Task<HashSet<string>> ReadTruncatedTablesAsync(
        NpgsqlConnection cn,
        long fromVersion,
        long toVersion,
        CancellationToken ct)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        await using var cmd = new NpgsqlCommand("""
            SELECT DISTINCT table_name
            FROM public.conecta_poste_tombstone
            WHERE op = 'T'
              AND version > @fromVersion
              AND version <= @toVersion;
            """, cn)
        {
            CommandTimeout = 30
        };
        cmd.Parameters.AddWithValue("fromVersion", fromVersion);
        cmd.Parameters.AddWithValue("toVersion", toVersion);

        await using var reader = await cmd.ExecuteReaderAsync(ct).ConfigureAwait(false);
        while (await reader.ReadAsync(ct).ConfigureAwait(false))
        {
            var table = reader.IsDBNull(0) ? null : reader.GetValue(0)?.ToString();
            if (!string.IsNullOrWhiteSpace(table))
                set.Add(table.Trim());
        }

        return set;
    }

    private static async Task<bool> HasTableChangesAsync(
        NpgsqlConnection cn,
        string tableName,
        long fromVersion,
        long toVersion,
        CancellationToken ct)
    {
        var safeTable = SafeTableName(tableName);
        await using var cmd = new NpgsqlCommand($"""
            SELECT EXISTS (
              SELECT 1
              FROM public.{safeTable}
              WHERE conecta_sync_version > @fromVersion
                AND conecta_sync_version <= @toVersion
              LIMIT 1
            )
            OR EXISTS (
              SELECT 1
              FROM public.conecta_poste_tombstone
              WHERE table_name = @tableName
                AND version > @fromVersion
                AND version <= @toVersion
              LIMIT 1
            );
            """, cn);
        cmd.Parameters.AddWithValue("fromVersion", fromVersion);
        cmd.Parameters.AddWithValue("toVersion", toVersion);
        cmd.Parameters.AddWithValue("tableName", tableName);
        var value = await cmd.ExecuteScalarAsync(ct).ConfigureAwait(false);
        return value is bool b && b;
    }

    private static async Task DeleteLocalPostesAsync(
        SqliteConnection sqlite,
        SqliteTransaction tx,
        IReadOnlyCollection<long> deletedPosteIds,
        CancellationToken ct)
    {
        if (deletedPosteIds.Count == 0) return;

        await using var cmdEmpresa = sqlite.CreateCommand();
        cmdEmpresa.Transaction = tx;
        cmdEmpresa.CommandText = "DELETE FROM empresa_poste WHERE id_poste = @id;";
        cmdEmpresa.Parameters.Add(new SqliteParameter("@id", SqliteType.Integer));
        cmdEmpresa.Prepare();

        await using var cmdPoste = sqlite.CreateCommand();
        cmdPoste.Transaction = tx;
        cmdPoste.CommandText = "DELETE FROM dados_poste WHERE id = @id;";
        cmdPoste.Parameters.Add(new SqliteParameter("@id", SqliteType.Integer));
        cmdPoste.Prepare();

        foreach (var id in deletedPosteIds)
        {
            ct.ThrowIfCancellationRequested();
            cmdEmpresa.Parameters["@id"].Value = id;
            await cmdEmpresa.ExecuteNonQueryAsync(ct).ConfigureAwait(false);
            cmdPoste.Parameters["@id"].Value = id;
            await cmdPoste.ExecuteNonQueryAsync(ct).ConfigureAwait(false);
        }
    }

    private static async Task<long> UpsertPostesByIdsAsync(
        NpgsqlConnection pg,
        SqliteConnection sqlite,
        SqliteTransaction tx,
        IReadOnlyCollection<long> ids,
        string latSql,
        string lonSql,
        Action<string, string, long, long> report,
        CancellationToken ct)
    {
        if (ids.Count == 0) return 0;

        await using var cmdPoste = sqlite.CreateCommand();
        cmdPoste.Transaction = tx;
        cmdPoste.CommandText = """
            INSERT INTO dados_poste
              (id, coordenadas, lat, lon, nome_municipio, nome_bairro, nome_logradouro, material, altura, tensao_mecanica, qtd_empresas, payload_json)
            VALUES
              (@id, @coordenadas, @lat, @lon, @municipio, @bairro, @logradouro, @material, @altura, @tensao, 0, @payload_json)
            ON CONFLICT(id) DO UPDATE SET
              coordenadas = excluded.coordenadas,
              lat = excluded.lat,
              lon = excluded.lon,
              nome_municipio = excluded.nome_municipio,
              nome_bairro = excluded.nome_bairro,
              nome_logradouro = excluded.nome_logradouro,
              material = excluded.material,
              altura = excluded.altura,
              tensao_mecanica = excluded.tensao_mecanica,
              payload_json = excluded.payload_json;
            """;
        cmdPoste.Parameters.Add(new SqliteParameter("@id", SqliteType.Integer));
        cmdPoste.Parameters.Add(new SqliteParameter("@coordenadas", SqliteType.Text));
        cmdPoste.Parameters.Add(new SqliteParameter("@lat", SqliteType.Real));
        cmdPoste.Parameters.Add(new SqliteParameter("@lon", SqliteType.Real));
        cmdPoste.Parameters.Add(new SqliteParameter("@municipio", SqliteType.Text));
        cmdPoste.Parameters.Add(new SqliteParameter("@bairro", SqliteType.Text));
        cmdPoste.Parameters.Add(new SqliteParameter("@logradouro", SqliteType.Text));
        cmdPoste.Parameters.Add(new SqliteParameter("@material", SqliteType.Text));
        cmdPoste.Parameters.Add(new SqliteParameter("@altura", SqliteType.Real));
        cmdPoste.Parameters.Add(new SqliteParameter("@tensao", SqliteType.Text));
        cmdPoste.Parameters.Add(new SqliteParameter("@payload_json", SqliteType.Text));
        cmdPoste.Prepare();

        long imported = 0;
        var processed = 0;
        foreach (var batch in ids.Chunk(DeltaBatchSize))
        {
            ct.ThrowIfCancellationRequested();
            var idStrings = batch.Select(x => x.ToString(CultureInfo.InvariantCulture)).ToArray();
            await using var cmd = new NpgsqlCommand($"""
                SELECT
                  d.id,
                  d.coordenadas,
                  {latSql} AS lat,
                  {lonSql} AS lon,
                  d.nome_municipio,
                  d.nome_bairro,
                  d.nome_logradouro,
                  d.material,
                  d.altura,
                  d.tensao_mecanica,
                  row_to_json(d)::text AS payload_json
                FROM public.dados_poste d
                WHERE d.id::text = ANY(@ids);
                """, pg)
            {
                CommandTimeout = 0
            };
            cmd.Parameters.AddWithValue("ids", idStrings);

            await using var reader = await cmd.ExecuteReaderAsync(ct).ConfigureAwait(false);
            while (await reader.ReadAsync(ct).ConfigureAwait(false))
            {
                var idRaw = reader.IsDBNull(0) ? "" : reader.GetValue(0)?.ToString() ?? "";
                if (!long.TryParse(OnlyDigits(idRaw), NumberStyles.Integer, CultureInfo.InvariantCulture, out var id) || id <= 0)
                    continue;

                var coord = reader.IsDBNull(1) ? null : reader.GetValue(1)?.ToString();
                var latIn = ReadAsDoubleOrNull(reader, 2);
                var lonIn = ReadAsDoubleOrNull(reader, 3);
                var (lat, lon, coordNorm) = NormalizeCoords(latIn, lonIn, coord);

                cmdPoste.Parameters["@id"].Value = id;
                cmdPoste.Parameters["@coordenadas"].Value = (object?)NullIfEmpty(coordNorm) ?? DBNull.Value;
                cmdPoste.Parameters["@lat"].Value = (object?)lat ?? DBNull.Value;
                cmdPoste.Parameters["@lon"].Value = (object?)lon ?? DBNull.Value;
                cmdPoste.Parameters["@municipio"].Value = (object?)NullIfEmpty(reader.IsDBNull(4) ? null : reader.GetValue(4)?.ToString()) ?? DBNull.Value;
                cmdPoste.Parameters["@bairro"].Value = (object?)NullIfEmpty(reader.IsDBNull(5) ? null : reader.GetValue(5)?.ToString()) ?? DBNull.Value;
                cmdPoste.Parameters["@logradouro"].Value = (object?)NullIfEmpty(reader.IsDBNull(6) ? null : reader.GetValue(6)?.ToString()) ?? DBNull.Value;
                cmdPoste.Parameters["@material"].Value = (object?)NullIfEmpty(reader.IsDBNull(7) ? null : reader.GetValue(7)?.ToString()) ?? DBNull.Value;
                cmdPoste.Parameters["@altura"].Value = (object?)ReadAsDoubleOrNull(reader, 8) ?? DBNull.Value;
                cmdPoste.Parameters["@tensao"].Value = (object?)NullIfEmpty(reader.IsDBNull(9) ? null : reader.GetValue(9)?.ToString()) ?? DBNull.Value;
                cmdPoste.Parameters["@payload_json"].Value = (object?)NullIfEmpty(reader.IsDBNull(10) ? null : reader.GetValue(10)?.ToString()) ?? DBNull.Value;

                await cmdPoste.ExecuteNonQueryAsync(ct).ConfigureAwait(false);
                imported++;
            }

            processed += batch.Length;
            report("postes", $"Atualizando postes alterados... {processed:n0}/{ids.Count:n0}", processed, ids.Count);
        }

        return imported;
    }

    private static async Task<long> RefreshEmpresasForPostesAsync(
        NpgsqlConnection pg,
        SqliteConnection sqlite,
        SqliteTransaction tx,
        IReadOnlyCollection<long> ids,
        Action<string, string, long, long> report,
        CancellationToken ct)
    {
        if (ids.Count == 0) return 0;

        await using var delete = sqlite.CreateCommand();
        delete.Transaction = tx;
        delete.CommandText = "DELETE FROM empresa_poste WHERE id_poste = @id;";
        delete.Parameters.Add(new SqliteParameter("@id", SqliteType.Integer));
        delete.Prepare();
        foreach (var id in ids)
        {
            delete.Parameters["@id"].Value = id;
            await delete.ExecuteNonQueryAsync(ct).ConfigureAwait(false);
        }

        await using var cmdEmpresa = sqlite.CreateCommand();
        cmdEmpresa.Transaction = tx;
        cmdEmpresa.CommandText = """
            INSERT OR IGNORE INTO empresa_poste (id_poste, empresa, id_insercao)
            SELECT @id_poste, @empresa, @id_insercao
            WHERE EXISTS (SELECT 1 FROM dados_poste WHERE id = @id_poste);
            """;
        cmdEmpresa.Parameters.Add(new SqliteParameter("@id_poste", SqliteType.Integer));
        cmdEmpresa.Parameters.Add(new SqliteParameter("@empresa", SqliteType.Text));
        cmdEmpresa.Parameters.Add(new SqliteParameter("@id_insercao", SqliteType.Text));
        cmdEmpresa.Prepare();

        long imported = 0;
        var processed = 0;
        foreach (var batch in ids.Chunk(DeltaBatchSize))
        {
            ct.ThrowIfCancellationRequested();
            var idStrings = batch.Select(x => x.ToString(CultureInfo.InvariantCulture)).ToArray();
            await using var cmd = new NpgsqlCommand("""
                SELECT ep.id_poste, ep.empresa, ep.id_insercao
                FROM public.empresa_poste ep
                WHERE ep.id_poste::text = ANY(@ids);
                """, pg)
            {
                CommandTimeout = 0
            };
            cmd.Parameters.AddWithValue("ids", idStrings);

            await using var reader = await cmd.ExecuteReaderAsync(ct).ConfigureAwait(false);
            while (await reader.ReadAsync(ct).ConfigureAwait(false))
            {
                var idPosteRaw = reader.IsDBNull(0) ? "" : reader.GetValue(0)?.ToString() ?? "";
                if (!long.TryParse(OnlyDigits(idPosteRaw), NumberStyles.Integer, CultureInfo.InvariantCulture, out var idPoste) || idPoste <= 0)
                    continue;

                var empresa = reader.IsDBNull(1) ? "" : (reader.GetValue(1)?.ToString() ?? "");
                if (string.IsNullOrWhiteSpace(empresa)) continue;
                if (empresa.Trim().Equals("DISPONÃVEL", StringComparison.OrdinalIgnoreCase)) continue;

                var idInsercao = reader.IsDBNull(2) ? null : reader.GetValue(2)?.ToString();
                cmdEmpresa.Parameters["@id_poste"].Value = idPoste;
                cmdEmpresa.Parameters["@empresa"].Value = empresa.Trim();
                cmdEmpresa.Parameters["@id_insercao"].Value = (object?)NullIfEmpty(idInsercao) ?? DBNull.Value;

                var n = await cmdEmpresa.ExecuteNonQueryAsync(ct).ConfigureAwait(false);
                if (n > 0) imported += n;
            }

            processed += batch.Length;
            report("empresas", $"Atualizando empresas dos postes alterados... {processed:n0}/{ids.Count:n0}", processed, ids.Count);
        }

        return imported;
    }

    private static async Task<long> ReloadTransformadoresAsync(
        NpgsqlConnection pg,
        SqliteConnection sqlite,
        SqliteTransaction tx,
        Action<string, string, long, long> report,
        CancellationToken ct)
    {
        await ExecSqliteAsync(sqlite, tx, "DELETE FROM transformadores;", ct).ConfigureAwait(false);
        await using var cmd = new NpgsqlCommand("SELECT row_to_json(t) FROM public.transformadores t", pg)
        {
            CommandTimeout = 0
        };
        await using var reader = await cmd.ExecuteReaderAsync(ct).ConfigureAwait(false);

        await using var cmdIns = sqlite.CreateCommand();
        cmdIns.Transaction = tx;
        cmdIns.CommandText = "INSERT INTO transformadores (payload_json) VALUES (@json);";
        cmdIns.Parameters.Add(new SqliteParameter("@json", SqliteType.Text));
        cmdIns.Prepare();

        long imported = 0;
        while (await reader.ReadAsync(ct).ConfigureAwait(false))
        {
            var json = reader.IsDBNull(0) ? null : reader.GetValue(0)?.ToString();
            if (string.IsNullOrWhiteSpace(json)) continue;
            cmdIns.Parameters["@json"].Value = json;
            await cmdIns.ExecuteNonQueryAsync(ct).ConfigureAwait(false);
            imported++;
            if (imported % 1000 == 0) report("transformadores", $"Atualizando transformadores... {imported:n0}", imported, 0);
        }

        return imported;
    }

    private static async Task<long> ReloadCensoAsync(
        NpgsqlConnection pg,
        SqliteConnection sqlite,
        SqliteTransaction tx,
        Action<string, string, long, long> report,
        CancellationToken ct)
    {
        await ExecSqliteAsync(sqlite, tx, "DELETE FROM censo_municipio;", ct).ConfigureAwait(false);
        await using var cmd = new NpgsqlCommand("SELECT poste FROM public.censo_municipio", pg)
        {
            CommandTimeout = 0
        };
        await using var reader = await cmd.ExecuteReaderAsync(ct).ConfigureAwait(false);

        await using var cmdIns = sqlite.CreateCommand();
        cmdIns.Transaction = tx;
        cmdIns.CommandText = "INSERT INTO censo_municipio (poste) VALUES (@poste);";
        cmdIns.Parameters.Add(new SqliteParameter("@poste", SqliteType.Text));
        cmdIns.Prepare();

        long imported = 0;
        while (await reader.ReadAsync(ct).ConfigureAwait(false))
        {
            var poste = reader.IsDBNull(0) ? null : reader.GetValue(0)?.ToString();
            if (string.IsNullOrWhiteSpace(poste)) continue;
            cmdIns.Parameters["@poste"].Value = poste.Trim();
            await cmdIns.ExecuteNonQueryAsync(ct).ConfigureAwait(false);
            imported++;
            if (imported % 1000 == 0) report("censo", $"Atualizando censo... {imported:n0}", imported, 0);
        }

        return imported;
    }

    private static long? TryParseLong(string? value)
    {
        return long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : null;
    }

    private static async Task<NeonRemoteManifest> BuildRemoteManifestAsync(
        NpgsqlConnection cn,
        bool hasEmpresaPoste,
        bool hasTransformadores,
        bool hasCenso,
        CancellationToken ct)
    {
        var dados = await BuildTableFingerprintAsync(cn, "dados_poste", ct).ConfigureAwait(false);
        var empresas = hasEmpresaPoste
            ? await BuildTableFingerprintAsync(cn, "empresa_poste", ct).ConfigureAwait(false)
            : new NeonTableFingerprint("empresa_poste", 0, null, "absent");
        var transformadores = hasTransformadores
            ? await BuildTableFingerprintAsync(cn, "transformadores", ct).ConfigureAwait(false)
            : new NeonTableFingerprint("transformadores", 0, null, "absent");
        var censo = hasCenso
            ? await BuildTableFingerprintAsync(cn, "censo_municipio", ct).ConfigureAwait(false)
            : new NeonTableFingerprint("censo_municipio", 0, null, "absent");

        var sb = new StringBuilder("manifest-v2");
        foreach (var fp in new[] { dados, empresas, transformadores, censo })
        {
            sb.Append('|')
              .Append(fp.TableName)
              .Append(":count=").Append(fp.Count.ToString(CultureInfo.InvariantCulture))
              .Append(":change=").Append(fp.MaxChangeValue ?? "")
              .Append(":key=").Append(fp.MaxKeyValue ?? "");
        }

        return new NeonRemoteManifest(
            Signature: sb.ToString(),
            TotalPostes: dados.Count,
            TotalEmpresas: empresas.Count,
            TotalTransformadores: transformadores.Count,
            TotalCenso: censo.Count);
    }

    private static async Task<NeonTableFingerprint> BuildTableFingerprintAsync(
        NpgsqlConnection cn,
        string tableName,
        CancellationToken ct)
    {
        var count = await CountRowsAsync(cn, tableName, ct).ConfigureAwait(false);
        var maxChangeValue = await ReadMaxChangeValueAsync(cn, tableName, ct).ConfigureAwait(false);
        var maxKeyValue = await ReadMaxKeyValueAsync(cn, tableName, ct).ConfigureAwait(false);
        return new NeonTableFingerprint(tableName, count, maxChangeValue, maxKeyValue);
    }

    private static async Task<string?> ReadMaxChangeValueAsync(NpgsqlConnection cn, string tableName, CancellationToken ct)
    {
        var column = await DetectFirstExistingColumnAsync(cn, tableName, new[]
        {
            "updated_at",
            "updatedat",
            "updated",
            "modified_at",
            "modified",
            "data_atualizacao",
            "data_alteracao",
            "dt_atualizacao",
            "dt_alteracao",
            "alterado_em",
            "created_at",
            "created"
        }, ct).ConfigureAwait(false);

        if (column is null) return null;

        var safeTable = SafeTableName(tableName);
        var safeColumn = QuoteIdentifier(column);
        return await ScalarTextAsync(cn, $"SELECT MAX({safeColumn})::text FROM public.{safeTable};", ct).ConfigureAwait(false);
    }

    private static async Task<string?> ReadMaxKeyValueAsync(NpgsqlConnection cn, string tableName, CancellationToken ct)
    {
        var safeTable = SafeTableName(tableName);
        string? expression = null;

        if (tableName.Equals("dados_poste", StringComparison.OrdinalIgnoreCase))
        {
            if (await ColumnExistsAsync(cn, tableName, "id", ct).ConfigureAwait(false))
                expression = "MAX(NULLIF(regexp_replace(id::text, '\\D', '', 'g'), '')::numeric)::text";
        }
        else if (tableName.Equals("empresa_poste", StringComparison.OrdinalIgnoreCase))
        {
            if (await ColumnExistsAsync(cn, tableName, "id", ct).ConfigureAwait(false))
                expression = "MAX(NULLIF(regexp_replace(id::text, '\\D', '', 'g'), '')::numeric)::text";
            else if (await ColumnExistsAsync(cn, tableName, "id_insercao", ct).ConfigureAwait(false))
                expression = "MAX(id_insercao::text)";
            else if (await ColumnExistsAsync(cn, tableName, "id_poste", ct).ConfigureAwait(false))
                expression = "MAX(NULLIF(regexp_replace(id_poste::text, '\\D', '', 'g'), '')::numeric)::text";
        }
        else if (tableName.Equals("transformadores", StringComparison.OrdinalIgnoreCase))
        {
            if (await ColumnExistsAsync(cn, tableName, "id", ct).ConfigureAwait(false))
                expression = "MAX(NULLIF(regexp_replace(id::text, '\\D', '', 'g'), '')::numeric)::text";
        }
        else if (tableName.Equals("censo_municipio", StringComparison.OrdinalIgnoreCase))
        {
            if (await ColumnExistsAsync(cn, tableName, "id", ct).ConfigureAwait(false))
                expression = "MAX(NULLIF(regexp_replace(id::text, '\\D', '', 'g'), '')::numeric)::text";
            else if (await ColumnExistsAsync(cn, tableName, "poste", ct).ConfigureAwait(false))
                expression = "MAX(poste::text)";
        }

        if (expression is null) return null;
        return await ScalarTextAsync(cn, $"SELECT {expression} FROM public.{safeTable};", ct).ConfigureAwait(false);
    }

    private static async Task<string?> ScalarTextAsync(NpgsqlConnection cn, string sql, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(sql, cn)
        {
            CommandTimeout = 0
        };
        var value = await cmd.ExecuteScalarAsync(ct).ConfigureAwait(false);
        return value == null || value == DBNull.Value ? null : Convert.ToString(value, CultureInfo.InvariantCulture);
    }

    private static async Task<string?> DetectFirstExistingColumnAsync(
        NpgsqlConnection cn,
        string tableName,
        IEnumerable<string> candidates,
        CancellationToken ct)
    {
        foreach (var candidate in candidates)
        {
            if (await ColumnExistsAsync(cn, tableName, candidate, ct).ConfigureAwait(false))
                return candidate;
        }

        return null;
    }

    private static string ExtractPostgresUrlIfEmbedded(string raw)
    {
        // Procura o início de um esquema postgres/postgresql dentro da string.
        var idx = raw.IndexOf("postgresql://", StringComparison.OrdinalIgnoreCase);
        if (idx < 0) idx = raw.IndexOf("postgres://", StringComparison.OrdinalIgnoreCase);
        if (idx < 0) return raw;

        var s = raw[idx..].Trim();
        // Corta se o usuário colou uma linha grande: pega até a primeira quebra de linha/whitespace.
        var cut = s.IndexOfAny(['\r', '\n', '\t', ' ']);
        if (cut > 0) s = s[..cut];
        return s;
    }

    private static string TrimOuterQuotes(string s)
    {
        s = (s ?? "").Trim();
        if (s.Length >= 2)
        {
            if ((s[0] == '\'' && s[^1] == '\'') || (s[0] == '"' && s[^1] == '"'))
            {
                return s[1..^1].Trim();
            }
        }
        return s.Trim().TrimEnd('\'', '"');
    }

    private static async Task<bool> TableExistsAsync(NpgsqlConnection cn, string tableName, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand("SELECT to_regclass(@r) IS NOT NULL", cn);
        cmd.Parameters.AddWithValue("r", $"public.{tableName}");
        var v = await cmd.ExecuteScalarAsync(ct).ConfigureAwait(false);
        return v is bool b && b;
    }

    private static string SafeTableName(string tableName) => tableName switch
    {
        "dados_poste" => "dados_poste",
        "empresa_poste" => "empresa_poste",
        "transformadores" => "transformadores",
        "censo_municipio" => "censo_municipio",
        _ => throw new ArgumentOutOfRangeException(nameof(tableName), tableName, "Tabela nÃ£o permitida.")
    };

    private static string QuoteIdentifier(string identifier) =>
        "\"" + (identifier ?? "").Replace("\"", "\"\"", StringComparison.Ordinal) + "\"";

    private static async Task<bool> ColumnExistsAsync(NpgsqlConnection cn, string tableName, string columnName, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand("""
            SELECT EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = @t
                AND column_name = @c
            );
            """, cn);
        cmd.Parameters.AddWithValue("t", tableName);
        cmd.Parameters.AddWithValue("c", columnName);
        var v = await cmd.ExecuteScalarAsync(ct).ConfigureAwait(false);
        return v is bool b && b;
    }

    private static async Task<(string? latColumn, string? lonColumn)> DetectLatLonColumnsAsync(NpgsqlConnection cn, CancellationToken ct)
    {
        // Possíveis nomes de coluna encontrados em bases NEON antigas/novas.
        var candidates = new (string Lat, string Lon)[]
        {
            ("lat", "lon"),
            ("lat", "lng"),
            ("latitude", "longitude"),
            ("latitude", "lon"),
            ("lat", "longitude"),
            ("latitude", "lng"),
        };

        foreach (var c in candidates)
        {
            var hasLat = await ColumnExistsAsync(cn, "dados_poste", c.Lat, ct).ConfigureAwait(false);
            var hasLon = await ColumnExistsAsync(cn, "dados_poste", c.Lon, ct).ConfigureAwait(false);
            if (hasLat && hasLon) return (c.Lat, c.Lon);
        }

        return (null, null);
    }

    private static async Task<long> CountRowsAsync(NpgsqlConnection cn, string tableName, CancellationToken ct)
    {
        // Identificadores não podem ser parametrizados, então restringimos a um set conhecido.
        var safe = tableName switch
        {
            "dados_poste" => "dados_poste",
            "empresa_poste" => "empresa_poste",
            "transformadores" => "transformadores",
            "censo_municipio" => "censo_municipio",
            _ => throw new ArgumentOutOfRangeException(nameof(tableName), tableName, "Tabela não permitida.")
        };

        await using var cmd = new NpgsqlCommand($"SELECT COUNT(1) FROM public.{safe};", cn)
        {
            CommandTimeout = 0
        };

        var v = await cmd.ExecuteScalarAsync(ct).ConfigureAwait(false);
        try { return Convert.ToInt64(v, CultureInfo.InvariantCulture); }
        catch { return 0; }
    }

    private static async Task ExecSqliteAsync(SqliteConnection cn, SqliteTransaction tx, string sql, CancellationToken ct)
    {
        await using var cmd = cn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = sql;
        await cmd.ExecuteNonQueryAsync(ct).ConfigureAwait(false);
    }

    private static async Task ExecPostgresAsync(NpgsqlConnection cn, string sql, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(sql, cn)
        {
            CommandTimeout = 0
        };
        await cmd.ExecuteNonQueryAsync(ct).ConfigureAwait(false);
    }

    private static async Task RebuildQtdEmpresasAsync(SqliteConnection cn, SqliteTransaction tx, CancellationToken ct)
    {
        // Reseta antes para evitar lixo de sync anterior (e manter resultado consistente no modo Upsert).
        await ExecSqliteAsync(cn, tx, "UPDATE dados_poste SET qtd_empresas = 0;", ct).ConfigureAwait(false);

        const string updateFromSql = """
            WITH counts AS (
              SELECT
                id_poste,
                COUNT(DISTINCT UPPER(TRIM(empresa))) AS cnt
              FROM empresa_poste
              WHERE empresa IS NOT NULL
                AND TRIM(empresa) <> ''
                AND UPPER(TRIM(empresa)) <> 'DISPONÍVEL'
              GROUP BY id_poste
            )
            UPDATE dados_poste
            SET qtd_empresas = counts.cnt
            FROM counts
            WHERE dados_poste.id = counts.id_poste;
            """;

        try
        {
            // UPDATE-FROM existe em SQLite >= 3.33.0. O bundle do Microsoft.Data.Sqlite normalmente é novo o bastante.
            await ExecSqliteAsync(cn, tx, updateFromSql, ct).ConfigureAwait(false);
            return;
        }
        catch (SqliteException ex) when (ex.SqliteErrorCode == 1) // SQLITE_ERROR (ex.: syntax error em SQLite antigo)
        {
            // Fallback: usa tabela temporária + subquery (compatível com SQLite antigo).
            await ExecSqliteAsync(cn, tx, "DROP TABLE IF EXISTS temp.tmp_counts;", ct).ConfigureAwait(false);
            await ExecSqliteAsync(cn, tx, """
                CREATE TEMP TABLE tmp_counts (
                  id_poste INTEGER PRIMARY KEY,
                  cnt INTEGER NOT NULL
                );
                """, ct).ConfigureAwait(false);

            await ExecSqliteAsync(cn, tx, """
                INSERT INTO tmp_counts (id_poste, cnt)
                SELECT
                  id_poste,
                  COUNT(DISTINCT UPPER(TRIM(empresa))) AS cnt
                FROM empresa_poste
                WHERE empresa IS NOT NULL
                  AND TRIM(empresa) <> ''
                  AND UPPER(TRIM(empresa)) <> 'DISPONÍVEL'
                GROUP BY id_poste;
                """, ct).ConfigureAwait(false);

            await ExecSqliteAsync(cn, tx, """
                UPDATE dados_poste
                SET qtd_empresas = COALESCE(
                  (SELECT cnt FROM tmp_counts WHERE tmp_counts.id_poste = dados_poste.id),
                  0
                );
                """, ct).ConfigureAwait(false);

            await ExecSqliteAsync(cn, tx, "DROP TABLE IF EXISTS temp.tmp_counts;", ct).ConfigureAwait(false);
        }
    }

    private static double? ReadAsDoubleOrNull(NpgsqlDataReader reader, int ordinal)
    {
        if (reader.IsDBNull(ordinal)) return null;

        var v = reader.GetValue(ordinal);
        return v switch
        {
            double d => double.IsFinite(d) ? d : null,
            float f => double.IsFinite((double)f) ? f : null,
            decimal m => (double)m,
            short s => s,
            int i => i,
            long l => l,
            string s => TryParseDouble(s),
            _ => TryParseDouble(v?.ToString() ?? "")
        };
    }

    private static (double? lat, double? lon, string? coord) NormalizeCoords(double? lat, double? lon, string? coord)
    {
        if (lat is not null && lon is not null && double.IsFinite(lat.Value) && double.IsFinite(lon.Value))
        {
            return (lat, lon, $"{lat.Value.ToString(CultureInfo.InvariantCulture)},{lon.Value.ToString(CultureInfo.InvariantCulture)}");
        }

        var c = (coord ?? "").Trim();
        if (c.Contains(','))
        {
            var parts = c.Split(',', 2, StringSplitOptions.TrimEntries);
            if (parts.Length == 2)
            {
                var la = TryParseDouble(parts[0]);
                var lo = TryParseDouble(parts[1]);
                if (la is not null && lo is not null)
                {
                    return (la, lo, $"{la.Value.ToString(CultureInfo.InvariantCulture)},{lo.Value.ToString(CultureInfo.InvariantCulture)}");
                }
            }
        }

        return (null, null, NullIfEmpty(coord));
    }

    private static double? TryParseDouble(string s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        s = s.Trim().Replace(" ", "");
        if (double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var v)) return v;
        if (double.TryParse(s.Replace(",", "."), NumberStyles.Float, CultureInfo.InvariantCulture, out v)) return v;
        return null;
    }

    private static string OnlyDigits(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        Span<char> buffer = stackalloc char[s.Length];
        var len = 0;
        foreach (var ch in s)
        {
            if (ch is >= '0' and <= '9')
            {
                buffer[len] = ch;
                len++;
            }
        }
        return new string(buffer[..len]);
    }

    private static string? NullIfEmpty(string? s)
    {
        s = (s ?? "").Trim();
        return string.IsNullOrWhiteSpace(s) ? null : s;
    }
}
