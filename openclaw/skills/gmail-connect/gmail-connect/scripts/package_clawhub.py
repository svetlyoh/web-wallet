#!/usr/bin/env python3
"""Export a clean ClawHub folder with the registry's runtime declarations."""
import argparse
import json
from pathlib import Path
import shutil


def export(destination):
    source=Path(__file__).resolve().parents[1]
    target=Path(destination).expanduser().resolve()
    if target.exists():raise ValueError('Choose a destination that does not already exist.')
    if target==source or source in target.parents:raise ValueError('Export outside the source skill folder.')
    # Only distribute known source directories; never copy arbitrary runtime state.
    target.mkdir(parents=True)
    try:
        shutil.copy2(source/'SKILL.md',target/'SKILL.md')
        for folder in ('scripts','assets','references','tests'):
            shutil.copytree(source/folder,target/folder,ignore=shutil.ignore_patterns('__pycache__','*.pyc','*.pyo','*.pyd'))
        skill=target/'SKILL.md'
        text=skill.read_text()
        metadata={'openclaw':{'os':['linux'],'requires':{'bins':['python3']},'homepage':'https://github.com/svetlyoh/web-wallet/tree/master/openclaw/skills/gmail-connect','envVars':[
            {'name':'GMAIL_CONNECT_HOME','required':False,'description':'Optional private local state directory, outside the skill folder.'}]}}
        head,body=text[4:].split('\n---',1)
        head='\n'.join(line for line in head.splitlines() if not line.startswith('metadata:'))
        skill.write_text('---\n'+head+'\nversion: 0.1.2\nmetadata: '+json.dumps(metadata,separators=(',',':'))+'\n---'+body)
    except Exception:
        shutil.rmtree(target)
        raise
    return target

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination',help='New output folder, normally /path/to/publish/gmail-connect')
    args=parser.parse_args()
    try:print(export(args.destination))
    except (ValueError,OSError) as error:parser.exit(1,str(error)+'\n')
