import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ApiError } from './util.js';

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export interface ProcessedPhoto {
  width: number;
  height: number;
}

/**
 * Поворот по EXIF, уменьшение до 1600 px по длинной стороне, WebP без метаданных
 * (sharp не переносит EXIF/GPS/ICC/XMP, пока не вызван withMetadata), превью 400 px.
 */
export async function processPhoto(
  input: Buffer,
  fullPath: string,
  thumbPath: string,
): Promise<ProcessedPhoto> {
  try {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    const base = () => sharp(input, { failOn: 'error' }).rotate();
    const full = await base()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    await base()
      .resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 74 })
      .toFile(thumbPath);
    await fs.writeFile(fullPath, full.data);
    return { width: full.info.width, height: full.info.height };
  } catch {
    throw new ApiError(
      415, 'bad_image',
      'Не удалось обработать файл. Загрузите фото в формате JPEG, PNG или WebP (до 10 МБ).',
    );
  }
}
