// Makes the certificates for HTTPS=1 (server.mjs), so phones, tablets and
// other computers on the same network can open the bench over https://,
// which capture needs:
//
//   .cert/ca.pem, ca-key.pem   a local certificate authority, made once and
//                              kept: the certificate each device trusts
//   .cert/cert.pem, key.pem    the server's certificate, issued by it, for
//                              localhost, 127.0.0.1 and this computer's
//                              current network addresses
//
//   npm run cert
//
// Apple's devices only offer full trust to a certificate authority (Settings
// > General > About > Certificate Trust Settings), not to a self-signed
// server certificate, and Android and desktop systems install an authority
// the same way, hence the two. Running it again (when the address
// changes) issues a new server certificate from the same authority, so the
// devices that trust it needn't be set up again. The authority can only
// vouch for localhost and private network addresses (name constraints), so
// trusting it trusts nothing on the internet. The server certificate lasts
// 825 days, the longest Apple platforms accept.
//
// Uses openssl, which Git for Windows, macOS and Linux all have. Each device
// must then trust ca.pem: see "Other devices on your network" in the README.
// (mkcert, if installed, does the same: write its server files to
// .cert/key.pem and .cert/cert.pem, and trust its own root instead.)

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(resolve(fileURLToPath(new URL("..", import.meta.url))), ".cert");
mkdirSync(dir, { recursive: true });
const file = (name) => join(dir, name);

const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => a.address);
const names = ["DNS:localhost", "IP:127.0.0.1", ...addresses.map((a) => `IP:${a}`)];
// The names the certificate authority may vouch for: localhost, and the loopback and private address ranges.
const PRIVATE = ["DNS:localhost", "IP:127.0.0.0/255.0.0.0", "IP:10.0.0.0/255.0.0.0", "IP:172.16.0.0/255.240.0.0", "IP:192.168.0.0/255.255.0.0"];

// An OPENSSL_CONF naming a file that isn't there (other software sets one) stops openssl;
// without it, openssl uses its own.
const env = { ...process.env, MSYS_NO_PATHCONV: "1", MSYS2_ARG_CONV_EXCL: "*" };
if (env.OPENSSL_CONF && !existsSync(env.OPENSSL_CONF)) delete env.OPENSSL_CONF;
// Git Bash rewrites a leading "/" in arguments as a Windows path; MSYS_NO_PATHCONV stops it.
const openssl = (...args) => execFileSync("openssl", args, { stdio: "inherit", env });

try {
  if (!existsSync(file("ca.pem")) || !existsSync(file("ca-key.pem"))) {
    openssl(
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "3650",
      "-keyout", file("ca-key.pem"),
      "-out", file("ca.pem"),
      "-subj", "/CN=Capture bench local CA",
      "-addext", "basicConstraints=critical,CA:TRUE,pathlen:0",
      "-addext", "keyUsage=critical,keyCertSign,cRLSign",
      // It can only vouch for this computer and private network addresses, never a real site,
      // so the devices that trust it are safe even if its key got out.
      "-addext", `nameConstraints=critical,${PRIVATE.map((n) => `permitted;${n}`).join(",")}`,
    );
    console.log("\nMade a new certificate authority: every device must trust the new .cert/ca.pem.");
  } else {
    console.log("Using the certificate authority already in .cert/ca.pem.");
  }
  openssl(
    "req", "-new", "-newkey", "rsa:2048", "-nodes", "-sha256",
    "-keyout", file("key.pem"),
    "-out", file("server.csr"),
    "-subj", "/CN=Capture bench (local)",
    "-addext", `subjectAltName=${names.join(",")}`,
    "-addext", "extendedKeyUsage=serverAuth",
    "-addext", "keyUsage=critical,digitalSignature,keyEncipherment",
    "-addext", "basicConstraints=critical,CA:FALSE",
  );
  openssl(
    "x509", "-req", "-sha256", "-days", "825",
    "-in", file("server.csr"),
    "-CA", file("ca.pem"),
    "-CAkey", file("ca-key.pem"),
    "-set_serial", `0x${randomBytes(16).toString("hex")}`,
    "-copy_extensions", "copyall",
    "-out", file("cert.pem"),
  );
  rmSync(file("server.csr"));
} catch (err) {
  console.error(`\nopenssl failed (${err.message}). Is it installed and on the PATH?`);
  process.exit(1);
}
console.log(`\nWrote ${dir}\\cert.pem and key.pem for ${names.join(", ")}`);
console.log("Start the server with: HTTPS=1 HOST=0.0.0.0 npm start");
