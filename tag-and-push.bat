@echo off
setlocal

REM Pull latest changes
git pull

REM Get the latest tag
set "LAST_TAG="
for /f "delims=" %%i in ('git tag --sort=-creatordate') do (
    if not defined LAST_TAG set "LAST_TAG=%%i"
)

echo.
if not defined LAST_TAG (
    echo No tags found.
    set "SUGGESTED_TAG=v0.1.0"
    goto done_suggest
)

echo Latest tag: %LAST_TAG%

REM Strip leading v if it exists
set "TAG_VER=%LAST_TAG%"
if /i "%TAG_VER:~0,1%"=="v" set "TAG_VER=%TAG_VER:~1%"

REM Parse version components
set MAJOR=
set MINOR=
set PATCH=
for /f "tokens=1,2,3 delims=." %%a in ("%TAG_VER%") do (
    set "MAJOR=%%a"
    set "MINOR=%%b"
    set "PATCH=%%c"
)

REM Fallback defaults
if "%MAJOR%"=="" set MAJOR=0
if "%MINOR%"=="" set MINOR=0
if "%PATCH%"=="" set PATCH=0

REM DEBUG
echo MAJOR=%MAJOR%
echo MINOR=%MINOR%
echo PATCH=%PATCH%

call set /a NEXT_PATCH=%PATCH% + 1
set "SUGGESTED_TAG=v%MAJOR%.%MINOR%.%NEXT_PATCH%"

:done_suggest
echo.
echo Suggested next tag: %SUGGESTED_TAG%
set /p NEW_TAG=Enter new tag (or press Enter to use suggested): 

if "%NEW_TAG%"=="" (
    set "NEW_TAG=%SUGGESTED_TAG%"
)

REM Add leading v if user forgot it
if /i not "%NEW_TAG:~0,1%"=="v" (
    set "NEW_TAG=v%NEW_TAG%"
)

REM Check if tag exists
git rev-parse -q --verify "refs/tags/%NEW_TAG%" >nul 2>&1
if %ERRORLEVEL%==0 (
    echo.
    echo Tag %NEW_TAG% already exists!
    pause
    exit /b 1
)

REM Write version.json with new version (strip leading 'v')
echo { "version": "%NEW_TAG:~1%" } > version.json

REM Tag and push
git tag %NEW_TAG%
git push
git push origin %NEW_TAG%

echo.
echo Tag %NEW_TAG% created and pushed successfully.
pause
