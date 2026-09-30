export const sanitizeProviderDisplayText = (value?: string | null) => {
  if (!value) return '';

  return String(value)
    .replace(/GPT12_ERROR:\s*error\s*code:\s*502/gi, 'Máy chủ AI tạm gián đoạn (502)')
    .replace(/GPT12_ERROR:\s*error\s*code:\s*504/gi, 'Máy chủ AI phản hồi quá lâu (Timeout)')
    .replace(/GPT12_ERROR:\s*/gi, 'Lỗi dịch vụ AI: ')
    .replace(/GOMMO_ERROR:\s*/gi, 'Lỗi dịch vụ AI: ')
    .replace(/GOMMO_ERROR/gi, 'Lỗi dịch vụ AI')
    .replace(/PROVIDER_ERROR/gi, 'Lỗi dịch vụ AI')
    .replace(/GOMMO_/gi, 'AI_')
    .replace(/\bGOMMO\b/gi, 'dịch vụ AI')
    .replace(/\bTST\b/gi, 'dịch vụ AI')
    .replace(/curl:\s*\(\d+\)/gi, 'Lỗi gián đoạn mạng')
    .replace(/524\s*<none>/gi, 'Quá thời gian chờ phản hồi (Timeout)');
};

