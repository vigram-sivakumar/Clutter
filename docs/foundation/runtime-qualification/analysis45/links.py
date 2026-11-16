"""Conservative, content-free relationship inspection; never computes latency."""
import sys,json,re
from pathlib import Path
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'trace42'))
from analyze import load_trace_xml,tag,process_pid

KEY_FIELDS={'surface-id','swap-id','connection-uuid','event-id','input-event-id','frame-id'}
TIME_FIELDS={'time','start','timestamp','event-time','input-timestamp','display-time','duration'}
ENUM_FIELDS={'event-type','event','type','event-kind','kind'}
UNITS={'ns','nanoseconds','us','microseconds','ms','milliseconds','s','seconds'}
INPUT_ENUMS={'keydown':'key-down','keyup':'key-up','nseventtypekeydown':'key-down','nseventtypekeyup':'key-up','kcgeventkeydown':'key-down','kcgeventkeyup':'key-up'}
def normalized(text): return (text or '').casefold().replace('_','-')
def inspect(path,target):
    root=load_trace_xml(path);defs={};ambiguous=set()
    for n in root.iter():
        if n.get('id'):
            key=(tag(n),n.get('id'))
            if key in defs: ambiguous.add(key)
            else: defs[key]=n
    def deref(node):
        seen=set()
        for _ in range(32):
            if not node.get('ref'): return node
            key=(tag(node),node.get('ref'))
            if key in seen or key in ambiguous or key not in defs:return None
            seen.add(key);node=defs[key]
        return None
    process_defs={n.get('id'):n for n in root.iter() if tag(n)=='process' and n.get('id') and ('process',n.get('id')) not in ambiguous}
    columns=[]
    for n in root.iter():
        if tag(n)=='col':
            name=next(((c.text or '') for c in n if tag(c)=='mnemonic'),'')
            if not re.fullmatch(r'[A-Za-z0-9_.:-]{1,120}',name):name='unknown-column'
            unit=next(((c.text or '').strip().casefold() for c in n.iter() if tag(c) in ['unit','units'] and (c.text or '').strip().casefold() in UNITS),'unvalidated')
            columns.append({'name':name,'unit':unit})
    rows=[n for n in root.iter() if tag(n)=='row'];inputs=[];details=[];unresolved=0;key_values={};ui_rows=0
    for row_number,row in enumerate(rows):
        pids=set();keys={};times={};kinds=set()
        for n in row.iter():
            if tag(n)=='process':
                pid=process_pid(n,process_defs)
                if pid:pids.add(pid)
        for index,cell in enumerate(list(row)):
            if index>=len(columns):continue
            meta=columns[index];name=normalized(meta['name']);value=deref(cell)
            if value is None:unresolved+=1;continue
            text=(value.text or '').strip()
            if name in KEY_FIELDS and re.fullmatch(r'\d{1,32}',text):keys[name]=text;key_values.setdefault(name,set()).add(text)
            if name in TIME_FIELDS and re.fullmatch(r'[+-]?\d+(?:\.\d+)?',text) and len(text)<=32:
                times[name]={'numericText':text,'tag':tag(value),'unit':meta['unit']}
            if name in ENUM_FIELDS:
                # Candidate enum recognition only. Never copy raw labels or treat this as a validated input parser.
                for label in [text,value.get('fmt','')]:
                    kind=INPUT_ENUMS.get(re.sub(r'[^a-z0-9]','',label.casefold()))
                    if kind:kinds.add(kind)
        if target in pids:ui_rows+=1
        detail={'row':row_number,'typedPids':sorted(pids),'semanticKeys':keys,'nativeTimes':times}
        if kinds:
            detail['candidateInputKinds']=sorted(kinds)
            if len(inputs)<12:inputs.append(detail)
        if len(details)<12 and (target in pids or keys):details.append(detail)
    return {'rows':len(rows),'columns':columns[:80],'targetUiMentionRows':ui_rows,'unresolvedCellReferences':unresolved,
            'candidateInputRowsSample':inputs,'relationshipRowsSample':details,
            'semanticKeys':{k:sorted(v)[:64] for k,v in key_values.items()},'ambiguousDefinitionCount':len(ambiguous),
            'unitsValidated':False,'ownershipValidated':False,'eventFrameJoinValidated':False}

def analyze(spec):
    target=spec['targetUiPid'];tables=[]
    for entry in spec['tables']:
        schema=entry['schema']
        if entry['status']!='structure-exported':tables.append({'schema':schema,'status':entry['status']});continue
        data=inspect(Path(spec['directory'])/(schema+'.xml'),target);tables.append({'schema':schema,'status':'inspected',**data})
    overlaps=[]
    for i,a in enumerate(tables):
        for b in tables[i+1:]:
            for key,values in a.get('semanticKeys',{}).items():
                shared=set(values)&set(b.get('semanticKeys',{}).get(key,[]))
                if shared:overlaps.append({'left':a['schema'],'right':b['schema'],'key':key,'sharedValues':sorted(shared)[:16]})
    return {'status':'relationship-inspection-complete','tables':tables,'identifierOverlaps':overlaps,
      'interpretation':'Typed PID mentions and semantic identifier overlap are candidate evidence, not causal joins or renderer ownership. XML intern IDs are never joined across files. Candidate enum recognition is not a validated keyboard event mapping.',
      'measurementGate':'blocked: input-to-candidate-displayed-frame/clock linkage not yet validated','latencyComputed':False,
      'stopRule':'If these bounded exports do not establish the required native links, retain H11 BLOCKED and scope the exact common observable needed; do not repeat recording or keep exporting unrelated tables.'}
if __name__=='__main__':
    try:
        if len(sys.argv)!=2:raise ValueError('ARGS')
        spec_path=Path(sys.argv[1])
        if spec_path.stat().st_size>1024*1024:raise ValueError('SPEC_LIMIT')
        print(json.dumps(analyze(json.loads(spec_path.read_text()))))
    except Exception:
        print(json.dumps({'status':'relationship-inspection-unavailable','latencyComputed':False}));sys.exit(2)
