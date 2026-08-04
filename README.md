# @pipeworx/nps

US National Park Service MCP — parks, alerts, campgrounds, things-to-do.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

- `list_parks(query?, state?, park_code?, limit?, start?)`
- `get_park(park_code)`
- `list_alerts(park_code?, state?, query?, limit?)`
- `list_campgrounds(park_code?, state?, query?, limit?)`
- `list_things_to_do(park_code?, state?, query?, limit?)`

## Auth

- **Platform key:** gateway env `PLATFORM_NPS_KEY`.
- **BYO:** `?_apiKey=<key>` after registering at https://www.nps.gov/subjects/developer/get-started.htm (free, generous limits).

## Data source

`https://developer.nps.gov/api/v1/` — header `X-Api-Key`.

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "nps": {
      "url": "https://gateway.pipeworx.io/nps/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Nps data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
