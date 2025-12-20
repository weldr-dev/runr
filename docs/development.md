Status: Implemented
Source: package.json, tsconfig.json, src/cli.ts

# Development

## Setup
```
npm install
```

## Build
```
npm run build
```

## Run (compiled)
```
node dist/cli.js --help
```

## Run (ts-node)
```
npm run dev -- --help
```

## Notes
- The CLI entry point is `src/cli.ts`.
- Build output is written to `dist/`.
