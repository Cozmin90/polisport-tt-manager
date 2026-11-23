import { play, serialLabel } from "../../lib/beerPong";

async function loadImage(src: string) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}
function voucherCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 1491;
  canvas.height = 1055;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browserul nu a putut pregăti imaginea voucherului.");
  return { canvas, ctx };
}
export async function prepareTemplate(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const { canvas, ctx } = voucherCanvas();
    ctx.drawImage(await loadImage(url), 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", .85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function downloadVoucher(id: string) {
  const prize = await play<{ number: number; image: string | null; name: string }>("voucher", { id });
  const { canvas, ctx } = voucherCanvas();
  if (prize.image) {
    ctx.drawImage(await loadImage(prize.image), 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#126432";
    ctx.lineWidth = 12;
    ctx.strokeRect(25, 25, 1441, 1005);
    ctx.fillStyle = "#10452a";
    ctx.font = "bold 48px Georgia";
    ctx.fillText("PoliSport Table Tennis", 90, 150);
    ctx.fillText("Voucher nr. " + serialLabel(prize.number), 895, 150, 500);
    ctx.font = "bold 96px Georgia";
    ctx.fillText("VOUCHER CADOU", 90, 380);
    ctx.font = "48px Georgia";
    ctx.fillText("1 antrenament gratuit de tenis de masă", 90, 500);
    ctx.fillText("Nume", 100, 620);
    ctx.font = "36px Georgia";
    ctx.fillText("Programare necesară · PoliSport-TT, Universitatea Politehnica din București", 85, 810);
  }
  ctx.fillStyle = "#143e2a";
  ctx.font = 'italic 55px "Segoe Script", "Brush Script MT", cursive';
  ctx.fillText(prize.name, 400, prize.number === 3 ? 622 : 610, 890);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Descarcă din nou voucherul.");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "PoliSport-BeerPong-" + id.slice(0, 8) + "-" + serialLabel(prize.number) + ".png";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
