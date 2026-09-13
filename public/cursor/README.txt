RhythmMania lazer-style menu cursor assets.

Drop your pictures here as:
  public/cursor/cursor.png          (main white arrow)
  public/cursor/cursor-additive.png (pink glow / additive flash layer)

The client loads these two files when they exist. If they are missing,
LazerCursor falls back to a built-in inline SVG arrow so the cursor
still works with zero setup.

Good sources for the two images:
- Export ppy/osu-resources `Cursor/menu-cursor` and
  `Cursor/menu-cursor-additive` to PNG, or
- Send your own screenshots and save them under these exact names.

Recommended size: ~90x90 or larger with transparency, arrow pointing
up-left. No code changes needed after adding the files, just refresh.
