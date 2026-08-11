/**
 * Chuẩn hoá ảnh chụp trước khi gửi lên máy chủ đọc chữ.
 *
 * Vì sao cần: ảnh điện thoại thường 3000-4000px. Mô hình thị giác tính chi phí theo
 * số điểm ảnh, nên một tấm như thế biến thành hơn một vạn token - vượt cửa sổ ngữ
 * cảnh của mô hình cục bộ (máy chủ trả lỗi thẳng), và nếu vừa thì cũng chờ rất lâu.
 *
 * Đo thực tế trên cùng một tờ khai viết tay:
 *   1000px - 11s, đọc sai/thiếu 5 trường (mất số hoá đơn, đảo hai ô ngày)
 *   1200px - 16s, đọc sai/thiếu 2 trường
 *   1500px - 34s, đọc sai/thiếu 3 trường
 * 1200px là điểm cân bằng: chữ viết tay vẫn đủ nét mà không phải chờ.
 */
export const MAX_IMAGE_EDGE = 1200;

/** Chỉ những định dạng mà máy chủ nhận. */
export const isImageFile = (file: File) =>
  /^image\//i.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);

/**
 * Thu ảnh về tối đa MAX_IMAGE_EDGE ở cạnh dài. Ảnh đã nhỏ hơn thì giữ nguyên,
 * không phóng to (phóng to không thêm thông tin, chỉ làm ảnh nặng hơn).
 *
 * Thất bại ở bất kỳ bước nào thì trả lại tệp gốc: đọc được ảnh gốc dù chậm vẫn tốt
 * hơn là báo lỗi và không đọc gì cả.
 */
export async function shrinkImageForOcr(file: File, maxEdge = MAX_IMAGE_EDGE): Promise<File> {
  if (!isImageFile(file) || typeof document === 'undefined') return file;

  try {
    const bitmap = await loadBitmap(file);
    const longEdge = Math.max(bitmap.width, bitmap.height);
    if (longEdge <= maxEdge) return file;

    const scale = maxEdge / longEdge;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // Ảnh chụp giấy có nền trắng: vẽ nền trước để ảnh PNG trong suốt không ra nền đen.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap as any, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      // 0.9: nén mạnh hơn sẽ sinh nhiễu quanh nét bút mảnh, đúng chỗ cần đọc rõ nhất.
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9),
    );
    if (!blob) return file;

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

/** createImageBitmap nhanh và không chặn luồng; trình duyệt cũ thì quay về thẻ <img>. */
async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // rơi xuống cách dưới
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Không đọc được ảnh'));
      img.src = url;
    });
  } finally {
    // Giải phóng sau khi ảnh đã nạp xong; giữ lại thì rò bộ nhớ mỗi lần upload.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
