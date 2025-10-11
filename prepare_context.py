import json
import os

# Define las rutas de entrada y salida
source_file = '/data/data/com.termux/files/home/conocimientos/normativa_nicaragua_por_seccion.json'
output_dir = '/data/data/com.termux/files/home/merxv2.1/context_data/normativa_secciones'

# Asegúrate de que el directorio de salida exista
os.makedirs(output_dir, exist_ok=True)

print(f"Leyendo el archivo de origen: {source_file}")

# Lee el archivo JSON de origen
with open(source_file, 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"Procesando {len(data)} secciones...")

# Itera sobre cada sección en el JSON y crea un archivo para cada una
for section_key, content in data.items():
    file_name = section_key.lower().replace(' ', '_') + '.txt'
    file_path = os.path.join(output_dir, file_name)
    
    with open(file_path, 'w', encoding='utf-8') as out_f:
        # Si el contenido es un diccionario o lista, lo convierte a un string JSON formateado
        if isinstance(content, (dict, list)):
            json.dump(content, out_f, ensure_ascii=False, indent=4)
        else:
            # Si ya es un string (o cualquier otra cosa), lo escribe directamente
            out_f.write(str(content))
    
    print(f"  -> Creado archivo: {file_path}")

print("¡Proceso completado! Los archivos de contexto por sección han sido creados.")