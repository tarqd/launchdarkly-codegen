# Go names use staticcheck's initialism list, frozen

Go convention writes initialisms in one case (`URL`, not `Url`), so the Go
converter upper-cases a word of a flag key that matches a known initialism.
We use staticcheck's ST1003 default list as of 2025.1.1, all 42 entries:

ACL, AMQP, API, ASCII, CPU, CSS, DB, DNS, EOF, GID, GUID, HTML, HTTP, HTTPS,
ID, IP, JSON, QPS, RAM, RPC, RTP, SIP, SLA, SMTP, SQL, SSH, TCP, TLS, TS,
TTL, UDP, UI, UID, URI, URL, UTF8, UUID, VM, XML, XMPP, XSRF, XSS.

The list lives in `core` and does not follow later staticcheck releases. ST1003
skips generated files, so nothing outside the generator enforces any list; we
picked the one Go developers already know.

We rejected a short list (`ID`, `URL`, `API` only), because it leaves names
like `HttpTimeout` that look wrong to Go readers, and a user-configurable list,
because the same key would then get different names in different repos.

This is recorded because adding or removing an entry renames every Go
identifier built from that word, which breaks consumers' code on regeneration.
A flag that needs a different spelling sets `codegen.name.go`.
