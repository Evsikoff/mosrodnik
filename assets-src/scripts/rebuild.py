"""Single-command rebuild from the saved local sources."""
import subprocess, sys
from common import ROOT, SRC

for script in ['prompts.py','build-assets.py','logo-assets.py','import-images.py','sample-data.py','qa-sheets.py','build-preview.py','manifest.py','check_assets.py']:
    print(f'Running {script}',flush=True)
    subprocess.run([sys.executable,str(SRC/'scripts'/script)],cwd=ROOT,check=True)
