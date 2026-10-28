# bofh-golem-compress

Compress memory files to golem-speak. Keeps a readable backup. Sends the file to the configured model provider.

## How to invoke

```
/bofh-golem-compress <filepath>
stop golem                   # back to normal
```

## Safety

- Secret-looking filenames refused before read.
- Original backed up to `<filename>.original.md` before overwrite.
- Code, paths, commands, URLs preserved verbatim.

## See also

- [`SKILL.md`](./SKILL.md): full LLM-facing instructions
