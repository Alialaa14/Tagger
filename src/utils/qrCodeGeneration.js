import QrCode from "qrcode";

export const generateQrCode = async (productId, userId) => {
  try {
    const qrCode = await QrCode.toDataURL(
      `http://localhost:5173/inventory/scan/${userId}/${productId}`,
      {
        errorCorrectionLevel: "H",
        type: "image/png",
        quality: 1,
        width: 300,
        height: 300,
        color: "#000000",
        backgroundColor: "#ffffff",
      },
    );

    return qrCode;
  } catch (error) {
    console.error("Error generating QR code:", error);
    return null;
  }
};
