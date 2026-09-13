# Builds index.html from the source parts in src/ (concatenated in order).
import os
root = os.path.dirname(os.path.abspath(__file__))
parts = ['01_head.html', '02_core.js', '03_world.js', '04_game.js']
out = ''.join(open(os.path.join(root, 'src', p), encoding='utf-8', newline='').read() for p in parts)
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8', newline='').write(out)
print('built index.html (%d bytes)' % len(out))
