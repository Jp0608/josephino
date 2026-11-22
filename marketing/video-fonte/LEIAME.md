# Vídeo de apresentação do Ondaro (20 s)

`scene.html` é a animação inteira, quadro a quadro (`window.renderFast(t)` com t em segundos).
As telas são capturas reais do app com dados de demonstração.

Para gerar o vídeo de novo (Node + Playwright + ffmpeg):

```bash
mkdir -p frames21
node render21.js "$PWD"
ffmpeg -framerate 30 -i frames21/f%05d.jpg -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart ondaro-apresentacao-20s.mp4
```

Textos, preços e cores estão no próprio `scene.html`. O vídeo não tem áudio.
