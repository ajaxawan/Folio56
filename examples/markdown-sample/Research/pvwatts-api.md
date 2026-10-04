# PVWatts API — quick notes

> [!TIP] Rate limits
> The demo key allows ~1,000 requests per hour.

## Request

```bash
curl "https://developer.nrel.gov/api/pvwatts/v8.json?api_key=KEY&system_capacity=4&lat=40&lon=-105"
```

## Key inputs

- **system_capacity** — kW DC
- **losses** — percent, default `14`
- **tilt**, **azimuth** — degrees

#### Deep heading that should become level 3

==Important:== results are *estimates*.
