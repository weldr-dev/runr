# Pack Security

## Path Traversal Protection

All pack names and template paths are sanitized to prevent directory traversal attacks.

### Pack Name Validation

Pack names must:
- Start with a lowercase letter
- Contain only lowercase letters, numbers, and hyphens
- Match the regex: `/^[a-z][a-z0-9-]*$/`

Invalid pack names are rejected:
```bash
# These are all rejected:
runr init --pack "../etc"
runr init --pack "../../etc/passwd"
runr init --pack "UPPERCASE"
runr init --pack "pack.name"
runr init --pack "pack_name"
```

### Template Path Validation

Template paths referenced in pack manifests:
- Are resolved relative to the pack directory
- Are verified to be within the pack directory
- Cannot escape via `../` or similar

### Defense in Depth

Multiple layers of protection:
1. **Input validation**: Regex check on pack name
2. **Path normalization**: Detect `..` and `/` in normalized paths
3. **Boundary check**: Verify resolved path is within expected directory
4. **Existence check**: Only load files that actually exist

## Testing

Security tests validate:
- Path traversal attempts are rejected
- Invalid characters in pack names are rejected
- Valid pack names are accepted
- Template paths cannot escape pack directory

Run security tests:
```bash
npm test -- src/packs/__tests__/loader.test.ts
```
