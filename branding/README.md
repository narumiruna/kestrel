# Kestrel icon system

`kestrel-icon.json` is the source of truth for Kestrel’s brand mark, colors, canvas, and Web corner radius.

After changing it, run:

```sh
just icons
just icons-check
```

The generator updates the committed Web favicon and Android adaptive-icon layers. Do not edit generated icon files directly.

UI glyphs remain native to each platform and are centralized separately:

- Web: `web/components/ui/icons.tsx` wraps Radix Icons.
- Android: `app/src/main/java/dev/narumi/kestrel/ui/components/KestrelIcons.kt` wraps Material icons.
