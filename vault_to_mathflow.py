import os
import re
import json
import hashlib
import subprocess
import base64
import sys
import argparse

# Đảm bảo terminal WSL hiển thị tốt UTF-8
try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

# ĐƯỜNG DẪN DỰA TRÊN VỊ TRÍ SCRIPT (Không hardcode tên User)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
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
    """Biên dịch TikZ code trực tiếp bằng các công cụ Linux trong WSL2."""
    hash_object = hashlib.md5(tikz_code.encode())
    img_name = f"tikz_{hash_object.hexdigest()[:10]}.svg"
    img_path = os.path.join(ASSETS_PATH, img_name)
    
    if os.path.exists(img_path):
        return img_name
    
    tex_content = f"""\\documentclass[tikz,border=5pt]{{standalone}}
\\usepackage{{amsmath,amssymb}}
\\usepackage{{tikz-3dplot}}
\\usetikzlibrary{{shapes.geometric,arrows,calc,intersections,angles,quotes}}
\\begin{{document}}
{tikz_code}
\\end{{document}}"""
    
    temp_tex = "temp_tikz.tex"
    with open(temp_tex, "w", encoding="utf-8") as f:
        f.write(tex_content)
    
    try:
        # Gọi trực tiếp các lệnh Linux (Không cần prefix 'wsl')
        subprocess.run(["latex", "-interaction=nonstopmode", temp_tex], check=True, capture_output=True)
        subprocess.run(["dvisvgm", "temp_tikz.dvi", "--no-fonts", "-o", os.path.join(ASSETS_PATH, img_name)], check=True, capture_output=True)
        print(f"Generated TikZ: {img_name}")
    except Exception as e:
        print(f"Error compiling TikZ: {e}")
        return None
    finally:
        for ext in [".tex", ".dvi", ".aux", ".log"]:
            try:
                if os.path.exists(f"temp_tikz{ext}"):
                    os.remove(f"temp_tikz{ext}")
            except OSError:
                pass
    return img_name

def parse_md_file(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    yaml_match = re.search(r'^---\n(.*?)\n---\n', content, re.DOTALL)
    if not yaml_match: return None
    
    yaml_text = yaml_match.group(1)
    body = content[yaml_match.end():].strip()
    
    metadata = {"raw_yaml": yaml_text}
    for line in yaml_text.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            metadata[k.strip()] = v.strip().strip('"').strip("'")
    
    options = []
    choicess_start = body.find('\\choicess')
    if choicess_start != -1:
        def get_balanced(text, start_pos):
            stack, res, found_start, in_comment, i = 0, "", False, False, start_pos
            while i < len(text):
                char = text[i]
                if in_comment:
                    if char == '\n': in_comment = False
                    if found_start: res += char
                    i += 1; continue
                if char == '%':
                    in_comment = True
                    if found_start: res += char
                    i += 1; continue
                if char == '\\':
                    if found_start:
                        res += char
                        if i + 1 < len(text): res += text[i+1]
                    i += 2; continue
                if char == '{':
                    if not found_start: found_start = True
                    stack += 1
                    if stack > 1: res += char
                elif char == '}':
                    stack -= 1
                    if stack == 0: return res, i
                    res += char
                else:
                    if found_start: res += char
                i += 1
            return None, -1

        _, next_pos = get_balanced(body, choicess_start)
        if next_pos != -1:
            temp_pos = next_pos + 1
            for _ in range(4):
                while temp_pos < len(body) and body[temp_pos] != '{': temp_pos += 1
                opt, end_p = get_balanced(body, temp_pos)
                if opt is not None:
                    options.append(opt.strip())
                    temp_pos = end_p + 1
                else: break
            
            correct_index = 0
            for i, opt in enumerate(options):
                clean_opt = opt.strip()
                if clean_opt.startswith('*'):
                    correct_index = i
                    options[i] = clean_opt[1:].strip()
                    break
            
            if len(options) == 4:
                body = body.replace(body[choicess_start:temp_pos], "")
                answer_index = correct_index
    
    if not options:
        opt_matches = re.findall(r'^[A-D][\.\)]\s*(.*)$', body, re.MULTILINE)
        if opt_matches:
            options = opt_matches
            body = re.sub(r'^[A-D][\.\)]\s*.*$', '', body, flags=re.MULTILINE).strip()

    for block in re.findall(r'(\\begin\{tikzpicture\}.*?\\end\{tikzpicture\})', body, re.DOTALL | re.IGNORECASE):
        img_name = get_svg_for_tikz(block)
        if img_name: body = body.replace(block, f'<img src="assets/{img_name}" class="tikz-img">')

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
    
    info_split = re.split(r'>\s*\[!(?:info|abstract)\]', body, maxsplit=1, flags=re.IGNORECASE)
    if len(info_split) > 1:
        body = info_split[0].strip()
        if not explanation: explanation = re.sub(r'^>\s*', '', info_split[1], flags=re.MULTILINE).strip()

    body = re.sub(r'\\begin\{minipage\}(\[.*?\])?\{.*?\}', '', body)
    body = re.sub(r'\\end\{minipage\}|\\hfill|\\centering|\\vspace\{.*?\}', '', body)
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
        "answer": hash_answer(correct_index if options else 0, MATHFLOW_SALT),
        "explanation": xor_encrypt(explanation, MATHFLOW_SALT),
        "metadata": metadata
    }

def main():
    parser = argparse.ArgumentParser(description="Xuất câu hỏi thuần WSL2.")
    parser.add_argument("--lop", type=str, default="11")
    parser.add_argument("--tag", type=str, default=None)
    parser.add_argument("--file", type=str, default=None)
    parser.add_argument("--time", type=str, default=None)
    parser.add_argument("--solve", action="store_true")
    args = parser.parse_args()

    questions = []
    
    if args.file:
        sel_file_path = args.file if os.path.isabs(args.file) else os.path.join(VAULT_PATH, args.file)
        
        if not os.path.exists(sel_file_path):
            # Tự động suy đoán thư mục Desktop trên Windows từ đường dẫn WSL hiện tại
            win_user_match = re.search(r'/mnt/c/Users/([^/]+)', BASE_DIR)
            win_user = win_user_match.group(1) if win_user_match else "User"
            potential_desktop_file = f"/mnt/c/Users/{win_user}/Desktop/{args.file}"
            
            if os.path.exists(potential_desktop_file):
                sel_file_path = potential_desktop_file
            else:
                found = False
                for r, _, f in os.walk(VAULT_PATH):
                    if args.file in f:
                        sel_file_path = os.path.join(r, args.file)
                        found = True; break
                if not found:
                    print(f"Error: Không thấy file {args.file} ở Vault hay Windows Desktop.")
                    return

        with open(sel_file_path, "r", encoding="utf-8") as f:
            sel_content = f.read()
        
        links = re.findall(r'\[\[(.*?)\]\]', sel_content)
        if links:
            for link in links:
                target_name = link if link.endswith(".md") else link + ".md"
                target_path = None
                for r, _, files in os.walk(VAULT_PATH):
                    if target_name in files:
                        target_path = os.path.join(r, target_name); break
                if target_path:
                    try:
                        q = parse_md_file(target_path)
                        if q: questions.append(q)
                    except Exception as e: print(f"Lỗi: {target_name}: {e}")
        elif "\\item" in sel_content:
            for i, raw_q in enumerate(re.split(r'\\item', sel_content)):
                if not raw_q.strip(): continue
                fake_md = "---\ntopic: 'On_tap'\ngrade: '10'\ntype: 'Trắc nghiệm'\n---\n\\item " + raw_q
                temp_fake = f"temp_bulk_{i}.md"
                with open(temp_fake, "w", encoding="utf-8") as f: f.write(fake_md)
                try:
                    q = parse_md_file(temp_fake)
                    if q: q["id"] = f"q{i}"; questions.append(q)
                finally:
                    if os.path.exists(temp_fake): os.remove(temp_fake)
        else:
            print("Error: Định dạng file không hợp lệ.")
            return
    else:
        search_path = os.path.join(VAULT_PATH, "01_Ngan_hang_cau_hoi", f"Lop_{args.lop}")
        if not os.path.exists(search_path): return
        
        for root, _, files in os.walk(search_path):
            for file in files:
                if file.endswith(".md"):
                    try:
                        q = parse_md_file(os.path.join(root, file))
                        if q:
                            q_grade = str(q['metadata'].get('grade', q['metadata'].get('lop', ''))).strip()
                            match_tag = not args.tag or args.tag.lower().replace("#", "") in q['metadata'].get('raw_yaml', '').lower()
                            if q_grade == args.lop and match_tag: questions.append(q)
                    except Exception: pass

    time_limit_minutes = None
    if args.time:
        t_str = args.time.strip().lower()
        try:
            if t_str.endswith('s'): time_limit_minutes = float(t_str[:-1]) / 60.0
            elif t_str.endswith('m'): time_limit_minutes = float(t_str[:-1])
            else: time_limit_minutes = float(t_str)
        except ValueError: return

    output_data = {"questions": questions, "allowSolve": args.solve}
    if time_limit_minutes is not None: output_data["timeLimit"] = time_limit_minutes

    with open(os.path.join(APP_PATH, "questions.json"), "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
        
    with open(os.path.join(APP_PATH, "questions.js"), "w", encoding="utf-8") as f:
        f.write(f"window.mathflowData = {json.dumps(output_data, ensure_ascii=False, indent=2)};")
    
    print(f"➔ Đã xuất {len(questions)} câu hỏi vào mathflow/questions.json (WSL Native)")

if __name__ == "__main__":
    main()