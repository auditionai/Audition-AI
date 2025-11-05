<script>
// The user wants more detailed and clearer instructions in the modal.
// I will rewrite the content for all four instruction keys (`character`, `style`, `prompt`, `advanced`)
// to be more comprehensive, provide better examples, and explain the "why" behind each feature.
</script>
import React from 'react';
import Modal from '../common/Modal';

type InstructionKey = 'character' | 'style' | 'prompt' | 'advanced';

interface InstructionModalProps {
    isOpen: boolean;
    onClose: () => void;
    instructionKey: InstructionKey | null;
}

const getInstructionContent = (key: InstructionKey | null) => {
    if (!key) return { title: 'Hướng dẫn', content: null };

    const contentMap: { [k in InstructionKey]: { title: string; content: React.ReactNode } } = {
        character: {
            title: 'Hướng dẫn Tải ảnh Nhân vật',
            content: (
                <div className="text-sm space-y-4 text-gray-300">
                    <div>
                        <p className="font-semibold text-white mb-2">Ảnh đầu vào là yếu tố quan trọng nhất quyết định chất lượng ảnh đầu ra. Hãy chọn ảnh:</p>
                        <ul className="list-disc list-inside space-y-1 pl-2">
                            <li>Chụp chính diện, rõ nét, không bị mờ nhòe.</li>
                            <li>Gương mặt không bị tóc, tay, hoặc vật thể khác che khuất.</li>
                            <li>Ánh sáng tốt, không quá tối hoặc cháy sáng.</li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="font-semibold text-pink-400 mb-2">Các tùy chọn đi kèm:</h4>
                        <ul className="list-disc list-inside space-y-3 pl-2">
                            <li><strong className="text-white">Khóa Face (Khuyên dùng):</strong> AI sẽ phân tích và "khóa" lại các đặc điểm nhận dạng cốt lõi như cấu trúc xương mặt, mắt, mũi, miệng từ ảnh gốc. Khi bạn mô tả quần áo hoặc bối cảnh mới, AI sẽ thay đổi các yếu tố đó nhưng vẫn giữ lại gương mặt của bạn một cách trung thực nhất.</li>
                            <li><strong className="text-white">Làm nét & Cải thiện (Khuyên dùng):</strong> Sử dụng thuật toán AI để tự động tăng cường độ phân giải, giảm nhiễu và làm rõ các chi tiết bị mờ trên ảnh gốc. Hãy luôn bật tính năng này để đảm bảo AI nhận được dữ liệu đầu vào tốt nhất.</li>
                        </ul>
                    </div>
                    <p className="pt-3 border-t border-white/10"><strong className="text-yellow-400">Lưu ý:</strong> Việc tải lên ảnh nhân vật sẽ phù hợp nhất với mô hình <span className="font-semibold">AUDITION AI V4 (Flash)</span> được tối ưu cho việc chỉnh sửa ảnh.</p>
                </div>
            ),
        },
        style: {
            title: 'Hướng dẫn Tải ảnh Mẫu',
            content: (
                 <div className="text-sm space-y-3 text-gray-300">
                    <p>Cung cấp cho AI một hình ảnh tham khảo để nó "học" theo phong cách nghệ thuật, tông màu, hoặc bố cục.</p>
                    <p>AI sẽ phân tích các yếu tố nghệ thuật của ảnh mẫu (tông màu, độ tương phản, cách phối màu, chất liệu...) và cố gắng áp dụng những đặc điểm này lên ảnh nhân vật của bạn.</p>
                    <p className="font-semibold text-white">Ví dụ:</p>
                    <ul className="list-disc list-inside space-y-1 pl-2">
                        <li><strong>Ảnh nhân vật</strong> + <strong>Ảnh mẫu (phong cảnh anime)</strong> = Nhân vật của bạn xuất hiện trong thế giới anime đó.</li>
                        <li><strong>Ảnh nhân vật</strong> + <strong>Ảnh mẫu (bức tranh sơn dầu)</strong> = Nhân vật của bạn được vẽ lại theo phong cách sơn dầu.</li>
                    </ul>
                 </div>
            ),
        },
        prompt: {
            title: 'Hướng dẫn Nhập câu lệnh',
            content: (
                <div className="text-sm space-y-3 text-gray-300">
                    <p>Đây là phần bạn "trò chuyện" với AI. Càng mô tả chi tiết và rõ ràng, AI càng hiểu rõ ý bạn. Hãy thử cấu trúc câu lệnh theo các yếu tố sau:</p>
                    <ul className="list-disc list-inside space-y-2 pl-2">
                        <li><strong>Chủ thể:</strong> "một cô gái xinh đẹp", "một chàng trai cool ngầu"...</li>
                        <li><strong>Trang phục:</strong> "mặc váy công chúa màu hồng", "áo hoodie đen và quần jean rách"...</li>
                        <li><strong>Hành động:</strong> "đang khiêu vũ", "ngồi trên ngai vàng", "chạy trên đường phố"...</li>
                        <li><strong>Bối cảnh:</strong> "trong một khu vườn cổ tích", "trên sân khấu rực rỡ ánh đèn", "dưới bầu trời đêm đầy sao"...</li>
                        <li><strong>Phong cách & Ánh sáng:</strong> "phong cách điện ảnh", "ánh sáng huyền ảo", "màu sắc rực rỡ", "siêu thực"...</li>
                    </ul>
                     <div className="p-3 bg-white/5 rounded-md mt-2">
                        <p className="font-semibold text-pink-400">Ví dụ câu lệnh tốt:</p>
                        <p className="italic">"cận cảnh một cô gái xinh đẹp tóc dài màu bạch kim, mặc váy dạ hội lấp lánh, đang khiêu vũ trong một cung điện hoàng gia, ánh sáng huyền ảo, phong cách kỳ ảo"</p>
                     </div>
                </div>
            ),
        },
        advanced: {
            title: 'Hướng dẫn Cài đặt nâng cao',
            content: (
                <div className="text-sm space-y-3 text-gray-300">
                    <p>Tinh chỉnh kết quả cuối cùng với các tùy chọn chuyên sâu:</p>
                    <ul className="list-disc list-inside space-y-3 pl-2">
                        <li><strong className="text-white">Phong cách:</strong> Áp dụng một "bộ lọc" nghệ thuật được tinh chỉnh sẵn. Chọn một phong cách sẽ giúp AI nhanh chóng định hình được 'mood & tone' tổng thể cho bức ảnh, giúp bạn tiết kiệm thời gian mô tả.</li>
                        <li><strong className="text-white">Mô hình AI:</strong> Mỗi mô hình có điểm mạnh riêng. <span className="font-semibold text-pink-400">V4 (Flash)</span> cân bằng tốc độ và chất lượng, rất tốt cho việc chỉnh sửa ảnh. Các mô hình <span className="font-semibold text-pink-400">PRO/ULTRA (Imagen 4)</span> cho chất lượng vượt trội, phù hợp nhất khi tạo ảnh mới hoàn toàn từ văn bản.</li>
                        <li><strong className="text-white">Tỷ lệ khung hình:</strong> Chọn kích thước cho ảnh. <strong className="text-yellow-400">Lưu ý:</strong> Tùy chọn này chỉ khả dụng khi bạn tạo ảnh từ văn bản (không tải lên ảnh nhân vật).</li>
                        <li><strong className="text-white">Seed ngẫu nhiên:</strong> Mỗi lần tạo ảnh, AI dùng một số "seed" để bắt đầu. Bật tùy chọn này, AI sẽ dùng seed mới mỗi lần, tạo ra các kết quả khác nhau dù cùng câu lệnh. Tắt đi, AI sẽ dùng lại seed cũ, giúp bạn tạo ra các biến thể nhỏ từ cùng một kết quả gốc.</li>
                    </ul>
                </div>
            ),
        },
    };
    return contentMap[key];
};


const InstructionModal: React.FC<InstructionModalProps> = ({ isOpen, onClose, instructionKey }) => {
    const { title, content } = getInstructionContent(instructionKey);
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            {content}
        </Modal>
    );
};

export default InstructionModal;