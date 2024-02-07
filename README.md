# setup-postgres-valgrind

An action for Postgres + Valgrind :tada:

- Great for testing Postgres extensions
- Works with regression and TAP tests

[![Build Status](https://github.com/ankane/setup-postgres-valgrind/actions/workflows/build.yml/badge.svg)](https://github.com/ankane/setup-postgres-valgrind/actions)

## Getting Started

Add it as a step to your workflow

```yml
      - uses: ankane/setup-postgres-valgrind@v1
```

Compile and install your extension

```yml
      - run: make
      - run: sudo --preserve-env=PG_CONFIG make install
```

And run your tests

```yml
      - run: make installcheck
      - run: make prove_installcheck
```

Errors are shown on the summary page and in the `Post Run` step

## Versions

Specify a Postgres version

```yml
      - uses: ankane/setup-postgres-valgrind@v1
        with:
          postgres-version: 16
```

Currently supports `16` (default), `15`, `14`, `13`, and `12`

Test against multiple versions

```yml
    strategy:
      matrix:
        postgres-version: [16, 15, 14, 13, 12]
    steps:
      - uses: ankane/setup-postgres-valgrind@v1
        with:
          postgres-version: ${{ matrix.postgres-version }}
```

## Options

Track the origin of uninitialized values (slower but useful for debugging)

```yml
      - uses: ankane/setup-postgres-valgrind@v1
        with:
          track-origins: yes
```

## References

- [Valgrind and Postgres](https://wiki.postgresql.org/wiki/Valgrind)
- [Memcheck Manual](https://valgrind.org/docs/manual/mc-manual.html)

## Credits

Thanks to Tom Lane for sharing [how to use Valgrind with TAP tests](https://www.postgresql.org/message-id/159904.1608307376%40sss.pgh.pa.us).

## Related Actions

- [setup-postgres](https://github.com/ankane/setup-postgres)

## Contributing

Everyone is encouraged to help improve this project. Here are a few ways you can help:

- [Report bugs](https://github.com/ankane/setup-postgres-valgrind/issues)
- Fix bugs and [submit pull requests](https://github.com/ankane/setup-postgres-valgrind/pulls)
- Write, clarify, or fix documentation
- Suggest or add new features
