import { existsSync, mkdirSync, readFileSync, realpathSync, openSync, writeFileSync, fsyncSync, closeSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve, relative, dirname, isAbsolute } from 'node:path';
import { atomic, hash, HttpError } from './store.ts';
export const MAX_NOTE_IMAGE_BYTES = 12 * 1024 * 1024;
export class Notes {
  root: string;
  constructor(root: string) { mkdirSync(root,{recursive:true}); this.root = realpathSync(root); }
  private within(path: string) { const r = relative(this.root,path); return r !== '..' && !r.startsWith('../') && !isAbsolute(r); }
  private resolvePath(name: string, valid: RegExp, message: string) {
    if (typeof name !== 'string' || !name || name.includes('\0') || isAbsolute(name) || !valid.test(name)) throw new HttpError(400,message);
    const path = resolve(this.root,name);
    if (!this.within(path)) throw new HttpError(403,'Note path is outside NOTES_DIR.');
    let parent = dirname(path);
    while (!existsSync(parent)) parent = dirname(parent);
    if (!this.within(realpathSync(parent)) || existsSync(path) && !this.within(realpathSync(path))) throw new HttpError(403,'Note symlink points outside NOTES_DIR.');
    return path;
  }
  path(name: string) { return this.resolvePath(name,/\.md$/i,'Notes must be relative .md paths inside NOTES_DIR.'); }
  read(name: string) { const path = this.path(name); const text = existsSync(path) ? readFileSync(path,'utf8') : ''; return {text,revision:hash(text)}; }
  save(name: string, text: string, revision: string) {
    if (typeof text !== 'string' || text.length > 500000) throw new HttpError(400,'Note is too large.');
    if (this.read(name).revision !== revision) throw new HttpError(409,'Note changed on disk. Reload it before saving.');
    const path = this.path(name); mkdirSync(dirname(path),{recursive:true}); atomic(path,text); return this.read(name);
  }
  saveImage(data: Buffer, type: string) {
    const images: Record<string,{ext:string;valid:(data:Buffer)=>boolean}> = {
      'image/png':{ext:'png',valid:data=>data.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))},
      'image/jpeg':{ext:'jpg',valid:data=>data.length>=3&&data[0]===0xff&&data[1]===0xd8&&data[2]===0xff},
      'image/webp':{ext:'webp',valid:data=>data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP'},
      'image/gif':{ext:'gif',valid:data=>['GIF87a','GIF89a'].includes(data.toString('ascii',0,6))}
    };
    const image=images[type.toLowerCase()];
    if(!image)throw new HttpError(415,'Use a PNG, JPEG, WebP, or GIF image.');
    if(data.length>MAX_NOTE_IMAGE_BYTES)throw new HttpError(413,'Images must be 12 MB or smaller.');
    if(!image.valid(data))throw new HttpError(400,'The uploaded file is not a valid image of the selected type.');
    const name=`assets/${randomUUID()}.${image.ext}`;
    const path=this.resolvePath(name,/^assets\/[a-f0-9-]+\.(?:png|jpg|webp|gif)$/i,'Invalid image path.');
    mkdirSync(dirname(path),{recursive:true});
    if(!this.within(realpathSync(dirname(path))))throw new HttpError(403,'Image path is outside NOTES_DIR.');
    const fd=openSync(path,'wx',0o600);
    try { writeFileSync(fd,data); fsyncSync(fd); } finally { closeSync(fd); }
    return {path:name};
  }
  readImage(name: string) {
    const path=this.resolvePath(name,/^assets\/[a-f0-9-]+\.(?:png|jpg|webp|gif)$/i,'Invalid image path.');
    if(!existsSync(path))throw new HttpError(404,'Image not found.');
    const ext=name.slice(name.lastIndexOf('.')+1).toLowerCase();
    const type:Record<string,string>={png:'image/png',jpg:'image/jpeg',webp:'image/webp',gif:'image/gif'};
    return {data:readFileSync(path),type:type[ext]};
  }
}
