/**
 * h3-js (emscripten) modül yüklenirken `new TextDecoder('utf-16le')` çağırır. Expo'nun
 * yerleşik TextDecoder'ı yalnız UTF-8 destekler ve başka kodlamada hata atar; bu da
 * @hexrun/core'un içe aktarılmasını kırar. UTF-8 dışı kodlamalar için küçük bir yedek kurarız.
 * Bu dosya her şeyden önce yüklenmelidir (index.ts).
 */
type DecoderCtor = new (label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean }) => { decode(input?: ArrayBufferView | ArrayBuffer): string };

const g = globalThis as unknown as { TextDecoder?: DecoderCtor; __hexrunTextDecoderPatched?: boolean };

class Utf16LeDecoder {
  readonly encoding = 'utf-16le';
  decode(input?: ArrayBufferView | ArrayBuffer): string {
    if (!input) return '';
    const buf = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    let out = '';
    for (let i = 0; i + 1 < buf.length; i += 2) out += String.fromCharCode(buf[i]! | (buf[i + 1]! << 8));
    return out;
  }
}

if (g.TextDecoder && !g.__hexrunTextDecoderPatched) {
  const Native = g.TextDecoder;
  let needsPatch = false;
  try {
    new Native('utf-16le');
  } catch {
    needsPatch = true;
  }
  if (needsPatch) {
    const Patched = function (this: unknown, label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean }) {
      const l = (label ?? 'utf-8').toLowerCase();
      if (l === 'utf-16le' || l === 'utf-16') return new Utf16LeDecoder();
      return new Native(label, options);
    } as unknown as DecoderCtor;
    g.TextDecoder = Patched;
  }
  g.__hexrunTextDecoderPatched = true;
}

export {};
