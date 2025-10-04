@rem
@rem Copyright 2015 the original author or authors.
@rem
@rem Licensed under the Apache License, Version 2.0 (the "License");
@rem you may not use this file except in compliance with the License.
@rem You may obtain a copy of the License at
@rem
@rem      https://www.apache.org/licenses/LICENSE-2.0
@rem
@rem Unless required by applicable law or agreed to in writing, software
@rem distributed under the License is distributed on an "AS IS" BASIS,
@rem WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
@rem See the License for the specific language governing permissions and
@rem limitations under the License.
@rem

@if "%DEBUG%"=="" @echo off
@rem ##########################################################################
@rem
@rem  Gradle startup script for Windows
@rem
@rem ##########################################################################

@rem Set local scope for the variables with windows NT shell
if "%OS%"=="Windows_NT" setlocal

set DIRNAME=%~dp0
if "%DIRNAME%"=="" set DIRNAME=.
@rem This is normally unused
set APP_BASE_NAME=%~n0
set APP_HOME=%DIRNAME%

@rem Resolve any "." and ".." in APP_HOME to make it shorter.
for %%i in ("%APP_HOME%") do set APP_HOME=%%~fi

@rem Add default JVM options here. You can also use JAVA_OPTS and GRADLE_OPTS to pass JVM options to this script.
set DEFAULT_JVM_OPTS="-Xmx64m" "-Xms64m"

@rem Find java.exe
if defined JAVA_HOME goto findJavaFromJavaHome

set JAVA_EXE=java.exe
%JAVA_EXE% -version >NUL 2>&1
if %ERRORLEVEL% equ 0 goto execute

echo.
echo ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.
echo.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation.

goto fail

:findJavaFromJavaHome
set JAVA_HOME=%JAVA_HOME:"=%
set JAVA_EXE=%JAVA_HOME%/bin/java.exe

if exist "%JAVA_EXE%" goto execute

echo.
echo ERROR: JAVA_HOME is set to an invalid directory: %JAVA_HOME%
echo.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation.

goto fail

:execute
@rem Setup the command line

set WRAPPER_JAR=%APP_HOME%\gradle\wrapper\gradle-wrapper.jar
if exist "%WRAPPER_JAR%" goto wrapperJarReady

for /f "usebackq tokens=1,* delims==" %%A in ("%APP_HOME%\gradle\wrapper\gradle-wrapper.properties") do (
    if "%%A"=="distributionUrl" set DISTRIBUTION_URL=%%B
)

if not defined DISTRIBUTION_URL (
    echo.
    echo ERROR: Could not determine Gradle distribution URL from gradle-wrapper.properties.
    echo.
    goto fail
)

powershell -NoLogo -NoProfile -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$distUrl = '%DISTRIBUTION_URL%' -replace '\\:', ':';" ^
  "$fileName = [System.IO.Path]::GetFileName($distUrl);" ^
  "if ($fileName -and $fileName.StartsWith('gradle-') -and $fileName.EndsWith('-bin.zip')) {" ^
  "  $version = $fileName.Substring(7, $fileName.Length - 7 - 8);" ^
  "} elseif ($fileName -and $fileName.StartsWith('gradle-') -and $fileName.EndsWith('-all.zip')) {" ^
  "  $version = $fileName.Substring(7, $fileName.Length - 7 - 8);" ^
  "} else {" ^
  "  throw 'Unable to extract Gradle version from distribution URL.'" ^
  "}" ^
  "$jarUrl = if ($env:GRADLE_WRAPPER_JAR_URL) { $env:GRADLE_WRAPPER_JAR_URL } else { 'https://services.gradle.org/distributions/gradle-' + $version + '-wrapper.jar' };" ^
  "$jarFile = $env:GRADLE_WRAPPER_JAR_FILE;" ^
  "$distributionOverride = if ($env:GRADLE_WRAPPER_DISTRIBUTION_URL) { $env:GRADLE_WRAPPER_DISTRIBUTION_URL } else { $distUrl };" ^
  "$destination = '%WRAPPER_JAR%';" ^
  "New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null;" ^
  "function Get-WebClient { $client = New-Object System.Net.WebClient; return $client }" ^
  "function Extract-JarFromDistribution([string] $zipPath, [string] $targetPath) {" ^
  "  Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue;" ^
  "  $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath);" ^
  "  try {" ^
  "    $targetDir = Split-Path -Parent $targetPath;" ^
  "    if ($targetDir) { New-Item -ItemType Directory -Force -Path $targetDir | Out-Null }" ^
  "    $pluginEntry = $zip.Entries | Where-Object { $_.FullName -like 'gradle-*/lib/plugins/gradle-wrapper-main-*.jar' } | Select-Object -First 1;" ^
  "    if ($pluginEntry) {" ^
  "      $memory = New-Object System.IO.MemoryStream;" ^
  "      try {" ^
  "        $pluginStream = $pluginEntry.Open();" ^
  "        try { $pluginStream.CopyTo($memory) } finally { $pluginStream.Dispose() }" ^
  "        $memory.Seek(0, [System.IO.SeekOrigin]::Begin) | Out-Null;" ^
  "        $nestedZip = New-Object System.IO.Compression.ZipArchive($memory, [System.IO.Compression.ZipArchiveMode]::Read, $false);" ^
  "        try {" ^
  "          $nestedEntry = $nestedZip.GetEntry('gradle-wrapper.jar');" ^
  "          if (-not $nestedEntry) { throw 'gradle-wrapper.jar missing inside gradle-wrapper-main archive.' }" ^
  "          $fileStream = [System.IO.File]::Open($targetPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write);" ^
  "          try {" ^
  "            $nestedStream = $nestedEntry.Open();" ^
  "            try { $nestedStream.CopyTo($fileStream) } finally { $nestedStream.Dispose() }" ^
  "          } finally { $fileStream.Dispose() }" ^
  "        } finally { $nestedZip.Dispose() }" ^
  "      } finally { $memory.Dispose() }" ^
  "      return" ^
  "    }" ^
  "    $entry = $zip.Entries | Where-Object { $_.FullName -like 'gradle-*/lib/gradle-wrapper-*.jar' -and $_.FullName -notlike '*-shared-*' } | Select-Object -First 1;" ^
  "    if (-not $entry) { throw 'Gradle wrapper jar not found in distribution archive.' }" ^
  "    $entryStream = $entry.Open();" ^
  "    try {" ^
  "      $fileStream = [System.IO.File]::Open($targetPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write);" ^
  "      try { $entryStream.CopyTo($fileStream) } finally { $fileStream.Dispose() }" ^
  "    } finally { $entryStream.Dispose() }" ^
  "  } finally { $zip.Dispose() }" ^
  "}" ^
  "if ($jarFile) {" ^
  "  if (-not (Test-Path $jarFile)) { throw (\"GRADLE_WRAPPER_JAR_FILE is set to '{0}' but the file does not exist.\" -f $jarFile) }" ^
  "  Copy-Item -Force $jarFile $destination" ^
  "} else {" ^
  "  $client = Get-WebClient;" ^
  "  try {" ^
  "    try {" ^
  "      $client.DownloadFile($jarUrl, $destination)" ^
  "    } catch {" ^
  "      $tempZip = [System.IO.Path]::GetTempFileName();" ^
  "      try {" ^
  "        $client.DownloadFile($distributionOverride, $tempZip);" ^
  "        Extract-JarFromDistribution $tempZip $destination" ^
  "      } catch {" ^
  "        throw (\"Failed to obtain Gradle wrapper jar from {0} or distribution {1}. {2}\" -f $jarUrl, $distributionOverride, $_.Exception.Message)" ^
  "      } finally {" ^
  "        Remove-Item -Force $tempZip" ^
  "      }" ^
  "    }" ^
  "  } finally {" ^
  "    $client.Dispose()" ^
  "  }" ^
  "}"

if %ERRORLEVEL% neq 0 goto fail

:wrapperJarReady
set CLASSPATH=%WRAPPER_JAR%


@rem Execute Gradle
"%JAVA_EXE%" %DEFAULT_JVM_OPTS% %JAVA_OPTS% %GRADLE_OPTS% "-Dorg.gradle.appname=%APP_BASE_NAME%" -classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %*

:end
@rem End local scope for the variables with windows NT shell
if %ERRORLEVEL% equ 0 goto mainEnd

:fail
rem Set variable GRADLE_EXIT_CONSOLE if you need the _script_ return code instead of
rem the _cmd.exe /c_ return code!
set EXIT_CODE=%ERRORLEVEL%
if %EXIT_CODE% equ 0 set EXIT_CODE=1
if not ""=="%GRADLE_EXIT_CONSOLE%" exit %EXIT_CODE%
exit /b %EXIT_CODE%

:mainEnd
if "%OS%"=="Windows_NT" endlocal

:omega
