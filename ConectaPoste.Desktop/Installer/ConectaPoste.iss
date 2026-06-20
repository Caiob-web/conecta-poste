#define MyAppName "Conecta Poste"
#define MyAppPublisher "Conecta Poste"
#define MyAppExeName "ConectaPoste.Desktop.exe"
#define MyWebView2Installer "MicrosoftEdgeWebView2RuntimeInstallerX64.exe"
#define WebView2ClientGuid "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"

[Setup]
AppId={{B03E9BA6-7A2B-4B56-9E02-70BB0710C6C2}
AppName={#MyAppName}
AppVersion=1.0.64
AppPublisher={#MyAppPublisher}
AppPublisherURL=https://conecta-poste.vercel.app
AppSupportURL=https://conecta-poste.vercel.app
AppUpdatesURL=https://conecta-poste.vercel.app
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputBaseFilename=ConectaPoste-Setup
Compression=none
SolidCompression=no
WizardStyle=modern
SetupIconFile=..\ConectaPoste.Desktop\Assets\app.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
VersionInfoVersion=1.0.64.0
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription=Instalador do Conecta Poste Desktop
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion=1.0.64

[Languages]
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar ícone na Área de Trabalho"; GroupDescription: "Atalhos:"; Flags: unchecked

[Files]
; Ajuste o Source para a pasta gerada pelo publish (veja README.md)
Source: "..\ConectaPoste.Desktop\bin\Release\net10.0-windows\win-x64\publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Opcional (offline): coloque o instalador Evergreen Standalone do WebView2 em:
;   Installer\Redist\{#MyWebView2Installer}
; Se não existir, o Setup compila/instala normalmente e o próprio app avisa ao abrir.
Source: "Redist\{#MyWebView2Installer}"; DestDir: "{tmp}"; Flags: deleteafterinstall skipifsourcedoesntexist

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; WorkingDir: "{app}"

[Run]
Filename: "{tmp}\{#MyWebView2Installer}"; Parameters: "/silent /install"; StatusMsg: "Instalando Microsoft Edge WebView2 Runtime..."; Flags: waituntilterminated skipifsilent skipifdoesntexist; Check: NeedsWebView2
; O app não é iniciado automaticamente após instalar para reduzir heurísticas de instaladores auto-executáveis.

[Code]
function HasWebView2RuntimeVersionAt(const RootKey: Integer; const SubKey: String): Boolean;
var
  PV: String;
begin
  Result := RegQueryStringValue(RootKey, SubKey, 'pv', PV) and (PV <> '') and (PV <> '0.0.0.0');
end;

function NeedsWebView2(): Boolean;
var
  SubKey64: String;
  SubKey32: String;
begin
  // Detecção via registry, conforme documentação do WebView2 Runtime (pv) em EdgeUpdate\Clients\{GUID}.
  // Em Windows 64-bit, o per-machine pode estar em WOW6432Node.
  SubKey64 := 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\' + '{#WebView2ClientGuid}';
  SubKey32 := 'SOFTWARE\Microsoft\EdgeUpdate\Clients\' + '{#WebView2ClientGuid}';

  if HasWebView2RuntimeVersionAt(HKEY_LOCAL_MACHINE, SubKey64) then
    Result := False
  else if HasWebView2RuntimeVersionAt(HKEY_LOCAL_MACHINE, SubKey32) then
    Result := False
  else if HasWebView2RuntimeVersionAt(HKEY_CURRENT_USER, SubKey64) then
    Result := False
  else if HasWebView2RuntimeVersionAt(HKEY_CURRENT_USER, SubKey32) then
    Result := False
  else
    Result := True;
end;
