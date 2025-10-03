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
  "$distUrl = '%DISTRIBUTION_URL%' -replace '\\:', ':';" ^
  "if ($distUrl -notmatch 'gradle-(?<ver>.+?)-(bin|all)\\.zip') { Write-Error 'Unable to extract Gradle version from distribution URL.'; exit 1 }" ^
  "$version = $Matches['ver'];" ^
  "$jarUrl = if ($env:GRADLE_WRAPPER_JAR_URL) { $env:GRADLE_WRAPPER_JAR_URL } else { 'https://services.gradle.org/distributions/gradle-' + $version + '-wrapper.jar' };" ^
  "$jarFile = $env:GRADLE_WRAPPER_JAR_FILE;" ^
  "$destination = '%WRAPPER_JAR%';" ^
  "New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null;" ^
  "if ($jarFile) {" ^
  "  if (-not (Test-Path $jarFile)) { throw (\"GRADLE_WRAPPER_JAR_FILE is set to '{0}' but the file does not exist.\" -f $jarFile) }" ^
  "  Copy-Item -Force $jarFile $destination" ^
  "} else {" ^
  "  $client = [System.Net.WebClient]::new();" ^
  "  try { $client.DownloadFile($jarUrl, $destination) } catch { throw (\"Failed to obtain Gradle wrapper jar from {0}. Provide GRADLE_WRAPPER_JAR_URL or GRADLE_WRAPPER_JAR_FILE.\" -f $jarUrl) } finally { $client.Dispose() }" ^
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
