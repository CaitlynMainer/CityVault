@echo off
setlocal enabledelayedexpansion

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

REM Strip leading v
set "TAG_VER=%LAST_TAG%"
if /i "%TAG_VER:~0,1%"=="v" set "TAG_VER=%TAG_VER:~1%"

REM Parse version components
for /f "tokens=1,2,3 delims=." %%a in ("%TAG_VER%") do (
    set "MAJOR=%%a"
    set "MINOR=%%b"
    set "PATCH=%%c"
)

if "%MAJOR%"=="" set MAJOR=0
if "%MINOR%"=="" set MINOR=0
if "%PATCH%"=="" set PATCH=0

set /a NEXT_PATCH=%PATCH% + 1
set "SUGGESTED_TAG=v%MAJOR%.%MINOR%.%NEXT_PATCH%"

:done_suggest
echo.
echo Suggested next tag: %SUGGESTED_TAG%
set /p NEW_TAG=Enter new tag (or press Enter to use suggested): 
if "%NEW_TAG%"=="" (
    set "NEW_TAG=%SUGGESTED_TAG%"
)

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

REM Strip 'v' prefix for version fields
set "VERNUM=%NEW_TAG:~1%"

echo.
echo Updating root package.json...
call npm version %VERNUM% --no-git-tag-version

REM Check if launcher folder has changed since last tag
git diff --name-only %LAST_TAG% HEAD | findstr /R "^launcher/" >nul 2>&1
if %ERRORLEVEL%==0 (
    echo Updating launcher/package.json...
    pushd launcher
    call npm version %VERNUM% --no-git-tag-version
    popd
) else (
    echo No launcher changes detected, skipping launcher version bump.
)

REM Commit version bumps
git add package.json launcher/package.json 2>nul
git commit -m "Bump version to %NEW_TAG%"

REM Tag and push
git tag %NEW_TAG%
git push
git push origin %NEW_TAG%

echo.
echo Tag %NEW_TAG% created, committed, and pushed successfully.
pause
