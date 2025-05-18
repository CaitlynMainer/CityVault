# CityVault

A Node.js based City of Heroes server control panel.  Offers automatic manifest generation for launchers, user management, and character views.

## Features

- Character Profiles pulled directly from server data
- User management
- Admin dashboard
- Multi-server support

## Requirements

- Node.js 22+
- npm 9+
- SQL Server

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/CaitlynMainer/CityVault
   cd CityVault
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the application:
   ```bash
   npm start
   ```

4. Follow on screen configuration wizard.

5. Visit the site at: `https://YourDomain`
The first request will try to issue you SSL Certificates, so it may take a few seconds to respond.

## Configuration

### `data/config.json`

This is your main config file.
The admin section on the website can also be used to modify the config.


### Email Configuration (MailerSend / SMTP)

To enable email verification and password reset functionality, configure the `email` section in your `data/config.json` or use the web-based config editor (`/admin/config`).

Example structure:

```json
"email": {
  "provider": "mailsend", // or "smtp"
  "fromEmail": "noreply@yourdomain.com",
  "mailersend": {
    "apiKey": "your-mailsend-api-key"
  },
  "smtp": {
    "host": "smtp.example.com",
    "port": "587",
    "auth": {
      "user": "smtp-user",
      "pass": "smtp-password"
    }
  }
}
```

#### `provider`
- Set to `"mailsend"` to use MailerSend. (https://mailersend.com)
- Set to `"smtp"` to use a custom SMTP provider.

#### `fromEmail`
- The email address that will appear as the sender for verification and password reset emails.

#### MailerSend Settings
- `apiKey`: Your MailerSend API key.

#### SMTP Settings
- `host`: SMTP server address.
- `port`: SMTP port (typically `"587"` for TLS).
- `auth.user`: SMTP username.
- `auth.pass`: SMTP password.

Changes to `config.json` can also be made through the web admin panel under **Configuration**.

## Admin Features

- `/admin/`: Access site config editor, update manager, server list, and news dashboard.
- Only users with `role: admin` in the database will see admin links.


# Hosting Game Files

To enable users to download and launch the game client from your server, follow these steps:

## 1. Place the Game Client Files

- **Directory**: Place the **entire unzipped game client** into the `/public/game` directory of your project.

  - **Example**: If your game client folder is named `CityOfHeroes`, move all its contents (not the folder itself) into `/public/game`.

- **Note**: Ensure that all necessary files, including executables and data folders, are present in `/public/game`.
![gameclient_layout](https://caitlynmainer.github.io/CityVault/gameclient_layout.png)
## 2. Configure the Manifest

- **Access the Admin Panel**: Navigate to `/admin/manifest` in your web browser.

- **Set Server Details**:

  - **Name**: Enter the name of your server (e.g., "My CoH Server").

  - **Website Link**: Provide the URL to your server's website or homepage.

- **Add a Profile**:

  - Click on the **"Add Profile"** button.

  - **Profile Name**: Enter a name for this profile. This name will appear in the game launcher.

  - **Executable Name**: Specify the name of the game's executable file (e.g., `CityOfHeroes.exe`, `OuroDev.exe`, etc.).

  - **Launch Parameters**: Set the parameters used to launch the game. For a default OuroDev server, use:

    ```
    -patchdir ouro -auth YOUR.SERVER.IP
    ```

    Replace `YOUR.SERVER.IP` with your server's actual IP address or domain name.

- **Save Changes**: After entering all the details, ensure you save the configuration.

## 3. Additional Tips

- **Multiple Profiles**: You can add multiple profiles if you host different versions or configurations of the game.

- **Testing**: After setting up, test the download and launch process to ensure everything works as expected.

- **Security**: Ensure that the `/public/game` directory is accessible to users but secured against unauthorized modifications.



## Development

- Tailwind CSS, EJS templates, Node.js backend
- Update notifications auto-fetched from GitHub
