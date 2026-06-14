import os
import re
import json
import hashlib
import subprocess
import base64
import sys
import argparse
import shutil
from concurrent.futures import ProcessPoolExecutor

try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if os.path.basename(BASE_DIR) == "mathflow":
    PARENT_DIR = os.path.dirname(BASE_DIR)
    VAULT_PATH = os.path.join(PARENT_DIR, "Math_Exam_Vault")
    APP_PATH = BASE_DIR
else:
    VAULT_PATH = os.path.join(BASE_DIR, "Math_Exam_Vault")
    APP_PATH = os.path.join(BASE_DIR, "mathflow")
ASSETS_PATH = os.path.join(APP_PATH, "assets")

MATHFLOW_SALT = "mathflow_secret_2026"

def xor_encrypt(text, key):
    if not text: return ""
    encrypted = [chr(ord(char) ^ ord(key[i % len(key)])) for i, char in enumerate(text)]
    return base64.b64encode("".join(encrypted).encode('utf-8')).decode('utf-8')

def hash_answer(answer_index, salt):
    return hashlib.sha256(f"{answer_index}_{salt}".encode('utf-8')).hexdigest()

def get_svg_for_tikz(tikz_code):
    hash_object = hashlib.md5(tikz_code.encode())
    img_hash = hash_object.hexdigest()[:10]
    img_name = f"tikz_{img_hash}.svg"
    img_path = os.path.join(ASSETS_PATH, img_name)
    
    # 6. Compilation Cache: Check local cache first
    cache_dir = os.path.join(os.path.dirname(APP_PATH), ".cache", "tikz")
    os.makedirs(cache_dir, exist_ok=True)
    cache_path = os.path.join(cache_dir, f"{img_hash}.svg")
    
    if os.path.exists(img_path):
        return img_name
        
    if os.path.exists(cache_path):
        try:
            shutil.copy(cache_path, img_path)
            return img_name
        except Exception as e:
            print(f"Error copying from cache: {e}")
            
    tex_content = f"\\documentclass[tikz,border=5pt]{{standalone}}\n\\usepackage{{amsmath,amssymb}}\n\\usepackage{{tikz-3dplot}}\n\\usetikzlibrary{{shapes.geometric,arrows,calc,intersections,angles,quotes}}\n\\begin{{document}}\n{tikz_code}\n\\end{{document}}"
    
    # Unique temp prefix based on hash to avoid multiprocessing write conflicts
    temp_prefix = f"temp_tikz_{img_hash}"
    temp_tex = f"{temp_prefix}.tex"
    with open(temp_tex, "w", encoding="utf-8") as f:
        f.write(tex_content)
    
    try:
        subprocess.run(["latex", "-interaction=nonstopmode", temp_tex], check=True, capture_output=True)
        subprocess.run(["dvisvgm", f"{temp_prefix}.dvi", "--no-fonts", "-o", cache_path], check=True, capture_output=True)
        if os.path.exists(cache_path):
            shutil.copy(cache_path, img_path)
        else:
            return None
    except Exception as e:
        print(f"Error compiling TikZ: {e}")
        return None
    finally:
        for ext in [".tex", ".dvi", ".aux", ".log"]:
            filename = f"{temp_prefix}{ext}"
            if os.path.exists(filename):
                try:
                    os.remove(filename)
                except OSError:
                    pass
    return img_name

def parse_md_file(file_path):
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
        return None

    yaml_match = re.search(r'^---\n(.*?)\n---\n', content, re.DOTALL)
    if not yaml_match:
        return None
    
    yaml_text = yaml_match.group(1)
    body = content[yaml_match.end():].strip()
    
    metadata = {"raw_yaml": yaml_text}
    for line in yaml_text.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            metadata[k.strip()] = v.strip().strip('"').strip("'")
    
    options = []
    answer_index = 0

    # 7. Use robust regex with 1 level of nested braces for option blocks
    choicess_match = re.search(
        r'\\choicess\s*\{(\d+)\}\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}',
        body,
        re.DOTALL
    )
    if choicess_match:
        raw_options = [
            choicess_match.group(2).strip(),
            choicess_match.group(3).strip(),
            choicess_match.group(4).strip(),
            choicess_match.group(5).strip()
        ]
        
        correct_index = 0
        for i, opt in enumerate(raw_options):
            if opt.startswith('*'):
                correct_index = i
                options.append(opt[1:].strip())
            else:
                options.append(opt)
                
        body = body.replace(choicess_match.group(0), "")
        answer_index = correct_index
    
    if not options:
        opt_matches = re.findall(r'^[A-D][\.\)]\s*(.*)$', body, re.MULTILINE)
        if opt_matches:
            options = opt_matches
            body = re.sub(r'^[A-D][\.\)]\s*.*$', '', body, flags=re.MULTILINE).strip()

    # Compile TikZ blocks in content
    for block in re.findall(r'(\\begin\{tikzpicture\}.*?\\end\{tikzpicture\})', body, re.DOTALL | re.IGNORECASE):
        img_name = get_svg_for_tikz(block)
        if img_name:
            body = body.replace(block, f'<img src="assets/{img_name}" class="tikz-img">')

    explanation = ""
    explanation_lines, in_explanation, new_body_lines = [], False, []
    for line in body.splitlines():
        start_match = re.match(r'^\s*%\s*(?:Lời giải|HDG|Hướng dẫn giải|Lời giải chi tiết)\s*:\s*(.*)', line, re.IGNORECASE)
        if start_match:
            in_explanation = True
            explanation_lines.append(start_match.group(1).strip())
        elif in_explanation and line.strip().startswith('%'):
            explanation_lines.append(re.sub(r'^\s*%\s*', '', line).strip())
        else:
            if in_explanation: in_explanation = False
            new_body_lines.append(line)
            
    if explanation_lines:
        explanation = "\n".join(explanation_lines).strip()
        body = "\n".join(new_body_lines)

    # Secondary explanation check for info block split
    info_split = re.split(r'>\s*\[!(?:info|abstract)\]', body, maxsplit=1, flags=re.IGNORECASE)
    if len(info_split) > 1:
        body = info_split[0].strip()
        if not explanation:
            explanation = re.sub(r'^>\s*', '', info_split[1], flags=re.MULTILINE).strip()

    body = re.sub(r'\\begin\{minipage\}(\[.*?\])?\{.*?\}|\\end\{minipage\}|\\hfill|\\centering|\\vspace\{.*?\}', '', body)
    body = re.sub(r'%.*$', '', body, flags=re.MULTILINE)
    body = re.sub(r'^#.*?\n+', '', body, count=1).strip()
    body = re.sub(r'\^q-.*$|\\item\s*', '', body).strip()
    body = body.split("> [!info]")[0].strip()
    body = re.sub(r'\n{3,}', '\n\n', body).strip()

    return {
        "id": metadata.get("topic", "unlabeled"),
        "content": body.strip(),
        "type": "mcq" if options else "short_answer",
        "options": options,
        "answer": hash_answer(answer_index if options else 0, MATHFLOW_SALT),
        "explanation": xor_encrypt(explanation, MATHFLOW_SALT),
        "metadata": metadata
    }

def parse_bulk_item(task):
    i, fake_md = task
    temp_fake = f"temp_bulk_{i}.md"
    with open(temp_fake, "w", encoding="utf-8") as f:
        f.write(fake_md)
    try:
        q = parse_md_file(temp_fake)
        if q:
            q["id"] = f"q{i}"
            return q
    except Exception as e:
        print(f"Error parsing bulk item {i}: {e}")
        return None
    finally:
        if os.path.exists(temp_fake):
            try:
                os.remove(temp_fake)
            except OSError:
                pass
    return None

def main():
    parser = argparse.ArgumentParser(description="Gom full kho đề chuyển giao xử lý Ma trận cho Frontend.")
    parser.add_argument("--lop", type=str, default="11")
    parser.add_argument("--tag", type=str, default=None)
    parser.add_argument("--file", type=str, default=None)
    parser.add_argument("--time", type=str, default=None)
    parser.add_argument("--solve", action="store_true")
    parser.add_argument("--matrix", type=str, default=None, help="Cấu hình ma trận E:NB:TH:VD (Ví dụ: 2:3:3:2)")
    args = parser.parse_args()

    questions = []
    
    if args.file:
        sel_file_path = args.file if os.path.isabs(args.file) else os.path.join(VAULT_PATH, args.file)
        if not os.path.exists(sel_file_path):
            win_user_match = re.search(r'/mnt/c/Users/([^/]+)', BASE_DIR)
            win_user = win_user_match.group(1) if win_user_match else "User"
            potential_desktop_file = f"/mnt/c/Users/{win_user}/Desktop/{args.file}"
            if os.path.exists(potential_desktop_file):
                sel_file_path = potential_desktop_file
        
        if not os.path.exists(sel_file_path):
            # Fallback search inside vault
            found = False
            for r, _, f in os.walk(VAULT_PATH):
                if args.file in f:
                    sel_file_path = os.path.join(r, args.file)
                    found = True
                    break
            if not found:
                print(f"Error: Không thấy file {args.file} ở Vault hay Windows Desktop.")
                return

        with open(sel_file_path, "r", encoding="utf-8") as f:
            sel_content = f.read()
        
        raw_links = re.findall(r'\[\[(.*?)\]\]', sel_content)
        # Filter out mathflow metadata links
        links = [l for l in raw_links if l.lower() != "mathflow"]
        
        if links:
            tasks = []
            for link in links:
                target_name = link if link.endswith(".md") else link + ".md"
                target_path = None
                for r, _, files in os.walk(VAULT_PATH):
                    if target_name in files:
                        target_path = os.path.join(r, target_name)
                        break
                if target_path:
                    tasks.append(target_path)
            
            # Multi-processing compilation for files
            with ProcessPoolExecutor() as executor:
                results = executor.map(parse_md_file, tasks)
                for q in results:
                    if q:
                        questions.append(q)
        elif "\\item" in sel_content:
            tasks = []
            for i, raw_q in enumerate(re.split(r'\\item', sel_content)):
                if not raw_q.strip():
                    continue
                
                # Skip YAML header
                if "---\n" in raw_q and i == 0:
                    continue
                
                detected_level = "NB"
                first_line = raw_q.strip().split('\n')[0]
                if first_line.startswith('%'):
                    lvl_match = re.search(r'level\s*:\s*([A-Z\d]+)', first_line, re.IGNORECASE)
                    if lvl_match:
                        detected_level = lvl_match.group(1).upper()
                
                fake_md = f"---\ntopic: 'q{i}'\ngrade: '{args.lop}'\nlevel: '{detected_level}'\ntype: 'Trắc nghiệm'\n---\n\\item " + raw_q
                tasks.append((i, fake_md))
            
            # Multi-processing compilation for bulk items
            with ProcessPoolExecutor() as executor:
                results = executor.map(parse_bulk_item, tasks)
                for q in results:
                    if q:
                        questions.append(q)
    else:
        search_path = os.path.join(VAULT_PATH, "01_Ngan_hang_cau_hoi", f"Lop_{args.lop}")
        if os.path.exists(search_path):
            tasks = []
            for root, _, files in os.walk(search_path):
                for file in files:
                    if file.endswith(".md"):
                        tasks.append(os.path.join(root, file))
            
            # Multi-processing compilation for directories
            with ProcessPoolExecutor() as executor:
                results = executor.map(parse_md_file, tasks)
                for q in results:
                    if q:
                        q_grade = str(q['metadata'].get('grade', q['metadata'].get('lop', ''))).strip()
                        match_tag = not args.tag or args.tag.lower().replace("#", "") in q['metadata'].get('raw_yaml', '').lower()
                        if q_grade == args.lop and match_tag:
                            questions.append(q)

    time_limit_minutes = None
    if args.time:
        t_str = args.time.strip().lower()
        try:
            if t_str.endswith('s'):
                time_limit_minutes = float(t_str[:-1]) / 60.0
            elif t_str.endswith('m'):
                time_limit_minutes = float(t_str[:-1])
            else:
                time_limit_minutes = float(t_str)
        except ValueError:
            return

    output_data = {
        "questions": questions, 
        "allowSolve": args.solve,
        "matrix": args.matrix
    }
    if time_limit_minutes is not None:
        output_data["timeLimit"] = time_limit_minutes

    with open(os.path.join(APP_PATH, "questions.json"), "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    with open(os.path.join(APP_PATH, "questions.js"), "w", encoding="utf-8") as f:
        f.write(f"window.mathflowData = {json.dumps(output_data, ensure_ascii=False, indent=2)};")
    
    print(f"➔ Đã xuất đầy đủ {len(questions)} câu hỏi gốc và đính kèm cấu hình ma trận '{args.matrix}' lên Git Frontend!")

if __name__ == "__main__":
    main()