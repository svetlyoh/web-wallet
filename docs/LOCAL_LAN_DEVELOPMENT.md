# Local LAN Development

Run Lingry locally on the Windows PC so another LAN computer, such as the Ubuntu/OpenClaw PC, can reach it.

## Start On Windows

```powershell
cd "C:\Users\Svet\Documents\Sugarchain_Blackjack\Lingry"
npm run dev:lan
```

Keep that PowerShell window open. Wrangler should listen on `0.0.0.0:8787`, which means all Windows IPv4 interfaces.

The `dev:lan` script stores local Miniflare/Wrangler state in:

```text
%TEMP%\lingry-wrangler-state
```

That path is intentionally outside the repository. Keeping persistence out of the project folder prevents Wrangler from watching its own local SQLite state files and repeatedly reloading before requests can finish.

## URLs

Windows local tests use:

```text
http://127.0.0.1:8787
```

Other LAN machines use the Windows LAN IP:

```text
http://<WINDOWS_LAN_IP>:8787
```

At the time of this task, the Ubuntu/OpenClaw value is:

```text
http://192.168.1.13:8787
```

On Ubuntu, do not use `localhost` to reach the Windows Worker. `localhost` on Ubuntu points to Ubuntu itself.

## Firewall

The Windows network profile must be Private, and Windows Firewall must allow inbound TCP `8787` from the home LAN subnet, such as `192.168.1.0/24`.

## Safe Checks

In another Windows PowerShell terminal:

```powershell
curl.exe --noproxy "*" -i --max-time 5 http://127.0.0.1:8787/healthz
curl.exe --noproxy "*" -i --max-time 10 http://127.0.0.1:8787/
curl.exe --noproxy "*" -i --max-time 10 http://192.168.1.13:8787/healthz
netstat.exe -ano | findstr ":8787"
```

From Ubuntu/OpenClaw:

```bash
curl --noproxy '*' -i --max-time 10 http://192.168.1.13:8787/healthz
export LINGRY_API_BASE_URL="http://192.168.1.13:8787"
```

Run the non-destructive smoke test from Windows:

```powershell
npm run smoke:lan
```

Or target the LAN IP explicitly:

```powershell
$env:LINGRY_SMOKE_BASE_URL="http://192.168.1.13:8787"
npm run smoke:lan
```

The smoke test only performs safe `GET` requests. It does not create wallets, fund wallets, coin words, tip, broadcast transactions, or call LLM generation endpoints.
