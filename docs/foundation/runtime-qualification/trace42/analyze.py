"""Bounded structure/PID summary of an existing xctrace table, never raw app text."""
import json,re,sys
from pathlib import Path
import xml.etree.ElementTree as ET
LIMIT=4*1024*1024

def tag(node):
    value=node.tag.split('}')[-1]
    return value if re.fullmatch(r'[A-Za-z0-9_.:-]{1,100}',value) else 'unknown'

def process_pid(node,definitions):
    if tag(node)!='process': return None
    if node.get('ref'):
        node=definitions.get(node.get('ref'))
        if node is None: return None
    for child in node.iter():
        if tag(child)=='pid' and re.fullmatch(r'\d{1,10}',child.text or ''):
            value=int(child.text)
            return value if 0<value<=2147483647 else None
    # Typed process formatter fallback only; never infer a PID from a generic number.
    m=re.search(r'\((\d{1,10})\)$',node.get('fmt',''))
    return int(m[1]) if m and 0<int(m[1])<=2147483647 else None

def analyze(path,target):
    if path.stat().st_size>LIMIT: raise ValueError('XML_SIZE_LIMIT')
    data=path.read_bytes()
    if len(data)>LIMIT: raise ValueError('XML_SIZE_LIMIT')
    text=data.decode('utf-8-sig')
    if re.search(r'<!DOCTYPE|<!ENTITY',text,re.I): raise ValueError('XML_DECLARATION')
    root=ET.fromstring(text)
    definitions={n.get('id'):n for n in root.iter() if tag(n)=='process' and n.get('id')}
    columns=[]
    for node in root.iter():
        if tag(node)=='col':
            fields={tag(c):(c.text or '') for c in node}
            fields={k:v for k,v in fields.items() if k in ['mnemonic','type'] and re.fullmatch(r'[A-Za-z0-9_.:-]{1,120}',v)}
            if fields and len(columns)<80: columns.append(fields)
    rows=[n for n in root.iter() if tag(n)=='row']
    pids=set(); target_rows=0; unresolved=0
    for row in rows:
        row_pids=set()
        for n in row.iter():
            if tag(n)=='process':
                pid=process_pid(n,definitions)
                if pid: row_pids.add(pid)
                elif n.get('ref'): unresolved+=1
        pids.update(row_pids)
        if target in row_pids: target_rows+=1
    shapes=[]
    for row in rows[:3]:
        cells=[]
        for n in list(row)[:80]:
            cell={'tag':tag(n),'reference':bool(n.get('ref')),'nested':bool(list(n))}
            if re.fullmatch(r'[+-]?\d+(?:\.\d+)?',n.text or '') and len(n.text)<=32: cell['numericText']=n.text
            cells.append(cell)
        shapes.append(cells)
    return {'rootTag':tag(root),'rows':len(rows),'columns':columns,'firstRowShapes':shapes,
            'observedTypedProcessPids':sorted(pids)[:256],'targetUiRows':target_rows,'unresolvedProcessReferences':unresolved,
            'possibleLinkColumns':[c for c in columns if any(k in c.get('mnemonic','').lower() for k in ['parent','responsible','coalition'])],
            'interpretation':'Structure inventory only; numeric timestamp units, PID association/ownership and input-to-physical-presentation correlation not validated.'}
if __name__=='__main__':
    try:
        if len(sys.argv)!=3 or not sys.argv[2].isdigit(): raise ValueError('INVALID_ARGUMENTS')
        print(json.dumps(analyze(Path(sys.argv[1]),int(sys.argv[2]))))
    except Exception:
        print(json.dumps({'status':'xml-analysis-unavailable'}));sys.exit(2)
