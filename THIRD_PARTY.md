# Third-party material

NowLine's own code is Apache-2.0 (see [LICENSE](LICENSE)). The items below keep their original
licenses and are **not** re-licensed.

## QR Code Generator for JavaScript (`vendor/qrcode.js`)

- Author: Kazuhiko Arase, <http://www.d-project.com/>
- Source: <https://github.com/kazuhikoarase/qrcode-generator>
- Version: byte-identical to `qrcode.js` in the npm package `qrcode-generator@1.4.4`
- License: MIT (full text below and in [`vendor/qrcode.LICENSE`](vendor/qrcode.LICENSE)); the
  file's original header is kept unchanged.

> The word "QR Code" is registered trademark of DENSO WAVE INCORPORATED
> <http://www.denso-wave.com/qrcode/faqpatent-e.html>

NowLine uses the library unmodified to draw room-sign QR codes.

```
MIT License

Copyright (c) 2009 Kazuhiko Arase

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Tour voiceover (`assets/tour/01.mp3` … `13.mp3`)

- Generated offline from the tour script in `src/app.js` (`TOUR[].say`) with
  **Kokoro-82M** by hexgrad, voice **`af_heart`**.
- Model: <https://huggingface.co/hexgrad/Kokoro-82M>, licensed Apache-2.0
  (<https://www.apache.org/licenses/LICENSE-2.0>).
- No model weights or Kokoro code are distributed with NowLine, only the generated audio.
  The clips are 24 kHz mono MP3s; if a clip is missing or can't play, the tour falls back to the
  browser's built-in speech synthesis.
