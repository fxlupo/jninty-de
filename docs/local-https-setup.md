# Jninty Local HTTPS Setup with mkcert

Serve the Jninty PWA over HTTPS on your local network so you can install it on your phone.

PWAs require HTTPS for service workers and Add to Home Screen to work. localhost is exempt, but your LAN IP (e.g. 192.168.1.50) is not. mkcert creates locally-trusted certificates that fix this.

---

## One-Time Setup

### 1. Install mkcert

macOS:

```
brew install mkcert
```

Windows (Chocolatey):

```
choco install mkcert
```

Windows (Scoop):

```
scoop install mkcert
```

Linux (Ubuntu/Debian):

```
sudo apt install libnss3-tools
curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
chmod +x mkcert-v*-linux-amd64
sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert
```

### 2. Install the local Certificate Authority

```
mkcert -install
```

This creates a local CA and adds it to your system trust store. You only do this once.

### 3. Find your LAN IP

macOS:

```
ipconfig getifaddr en0
```

Linux:

```
hostname -I | awk '{print $1}'
```

Windows:

```
ipconfig
```

Look for the IPv4 Address.

### 4. Generate a certificate for your LAN IP

From the Jninty project root:

```
mkdir -p .certs
mkcert -key-file .certs/key.pem -cert-file .certs/cert.pem localhost 127.0.0.1 192.168.1.50
```

Replace `192.168.1.50` with **your** actual LAN IP.

### 5. Confirm .certs is in .gitignore

`.certs/` is already in the project `.gitignore`. If you removed it for some reason, add it back:

```
echo ".certs/" >> .gitignore
```

---

## Vite Configuration

The HTTPS config is already in `vite.config.ts`. It conditionally loads certs from `.certs/` if the directory exists, so production builds and CI are unaffected. No changes needed.

---

## Run It

Development:

```
npm run dev
```

Opens at: `https://192.168.1.50:5173`

Production preview (after `npm run build`):

```
npm run preview
```

Opens at: `https://192.168.1.50:4173`

Open that URL on your phone browser. You will see the padlock. Add to Home Screen works.

---

## Trust the Certificate on Your Phone

Your desktop already trusts the cert (`mkcert -install` handled that). Your phone does not yet.

### iOS

1. Find the CA cert:

   ```
   mkcert -CAROOT
   ```

   (typically `~/Library/Application Support/mkcert/` on macOS)

2. Send `rootCA.pem` to your iPhone (AirDrop, email, or iCloud)

3. On iPhone: open the file. "Profile Downloaded" appears.

4. **Settings > General > VPN and Device Management** > tap the profile > Install

5. **Settings > General > About > Certificate Trust Settings** > toggle full trust for the mkcert root CA

### Android

1. Find `rootCA.pem` (same command: `mkcert -CAROOT`)

2. Send it to your Android device

3. **Settings > Security > Encryption and credentials > Install a certificate > CA certificate**

4. Select the `rootCA.pem` file and confirm

After this, your phone trusts any certificate mkcert generates.

---

## Combining with CouchDB Sync

If you are also running CouchDB for sync (from the `sync/` directory), your phone talks to two services on your desktop:

```
Phone
  https://192.168.1.50:5173  ->  Vite dev server (the PWA)
  http://192.168.1.50:5984   ->  CouchDB (sync)
```

CouchDB runs on HTTP which is fine for LAN sync. The browser allows fetch requests to local network IPs over HTTP. If you want CouchDB on HTTPS too, you can add a Caddy reverse proxy, but it is not necessary for local use.

---

## Quick Reference

Regenerate certs (e.g. LAN IP changed):

```
mkcert -key-file .certs/key.pem -cert-file .certs/cert.pem localhost 127.0.0.1 NEW_IP
```

Check where CA root cert lives (for sending to phone):

```
mkcert -CAROOT
```

Verify cert details:

```
openssl x509 -in .certs/cert.pem -text -noout
```

---

## Troubleshooting

**Phone shows "Not Secure":**
Install `rootCA.pem` on phone (see Trust section above).

**Add to Home Screen not appearing:**
Verify HTTPS padlock is shown and `manifest.json` is valid.

**Cannot reach dev server from phone:**
Ensure `host: true` in Vite config and both devices are on the same WiFi.

**LAN IP changed after router restart:**
Regenerate cert with new IP, restart Vite.

**Cert expired:**
mkcert certs last about 2 years. Just regenerate.

**Service worker not registering:**
Must be HTTPS. Check browser DevTools > Application > Service Workers.
