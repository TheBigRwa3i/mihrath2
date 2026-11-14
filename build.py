from pathlib import Path
import re,json,base64
root=Path(__file__).resolve().parent
html=(root/'src/index.template.html').read_text(encoding='utf-8')
html=html.replace('/*__APP_CSS__*/',(root/'src/styles.css').read_text(encoding='utf-8'))
html=html.replace('/*__APP_JS__*/',(root/'src/app.js').read_text(encoding='utf-8'))
css=(root/'assets/tailwind.css').read_text()
used=set(re.findall(r'class="([^"]+)"',html))
used={part for value in used for part in value.split()}
# Tailwind's flat utility rules are selected directly from its MIT precompiled CSS.
# App responsive rules are intentionally authored in the second style block.
utilities=[]
for selector,body in re.findall(r'([^{}]+)\{([^{}]*)\}',css):
    selector=selector.strip()
    if selector.startswith('@'):continue
    classes=re.findall(r'\.([a-zA-Z_][a-zA-Z0-9_-]*)',selector)
    if classes and all(c in used for c in classes) and ':' not in selector and '\\' not in selector:
        utilities.append(selector+'{'+body+'}')
css='/* Tailwind CSS v2.2.19 | MIT License | https://tailwindcss.com */\n'+'\n'.join(dict.fromkeys(utilities))
font=''
for filename,weight in [('NotoSansArabic-Regular.ttf',400),('NotoSansArabic-Bold.ttf',700)]:
 data=base64.b64encode((root/'assets/fonts'/filename).read_bytes()).decode()
 font+=f"@font-face{{font-family:'Noto Sans Arabic';font-style:normal;font-weight:{weight};font-display:swap;src:url(data:font/ttf;base64,{data}) format('truetype')}}\n"
nasa={key:json.loads((root/f'data/nasa-{key}.json').read_text()) for key in ['mafraq','valley','irbid']}
html=html.replace('/*__TAILWIND__*/',css).replace('/*__FONT__*/',font).replace('/*__NASA_DATA__*/',json.dumps(nasa,ensure_ascii=False,separators=(',',':')))
output=root/'index.html'
output.write_text(html,encoding='utf-8')
(root/'dist').mkdir(exist_ok=True)
(root/'dist/index.html').write_text(html,encoding='utf-8')
script=re.search(r'<script>([\s\S]*?)</script>',html).group(1)
# The complete output is intentionally self-contained; source JS stays in src/app.js.
print(f'{output}\nHTML: {len(html.encode()):,} bytes; Tailwind CSS: {len(css):,} bytes; embedded font faces: 2')
