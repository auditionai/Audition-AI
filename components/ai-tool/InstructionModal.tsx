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
                        <p className="font-semibold text-white mb-2">Ảnh đầu vào là yếu tố quan trọng nhất. Hãy chọn ảnh:</p>
                        <ul className="list-disc list-inside space-y-1 pl-2">
                            <li>Chụp <span className="text-green-400">chính diện, rõ nét,</span> không bị mờ nhòe.</li>
                            <li>Gương mặt <span className="text-green-400">không bị tóc, tay, hoặc vật thể khác che khuất.</span></li>
                            <li><span className="text-green-400">Ánh sáng tốt,</span> không quá tối hoặc cháy sáng.</li>
                        </ul>
                    </div>
                     <div>
                        <h4 className="font-semibold text-pink-400 mb-2">Mục đích:</h4>
                        <p>
                           AI sẽ phân tích và "khóa" lại các đặc điểm nhận dạng cốt lõi như cấu trúc xương mặt, mắt, mũi, miệng từ ảnh gốc. Khi bạn mô tả quần áo hoặc bối cảnh mới, AI sẽ thay đổi các yếu tố đó nhưng vẫn <strong className="text-white">giữ lại gương mặt của bạn một cách trung thực nhất.</strong>
                        </p>
                    </div>
                    <p className="pt-3 border-t border-white/10"><strong className="text-yellow-400">Lưu ý:</strong> Việc tải lên ảnh nhân vật sẽ phù hợp nhất với mô hình <span className="font-semibold">AUDITION AI V4 (Flash)</span> được tối ưu cho việc chỉnh sửa và giữ lại đặc điểm ảnh gốc.</p>
                </div>
            ),
        },
        style: {
            title: 'Hướng dẫn Tải ảnh Mẫu',
            content: (
                 <div className="text-sm space-y-3 text-gray-300">
                    <p>Cung cấp cho AI một hình ảnh tham khảo để nó "học" theo phong cách nghệ thuật, tông màu, hoặc bố cục.</p>
                    <p>AI sẽ phân tích các yếu tố của ảnh mẫu (tông màu, độ tương phản, cách phối màu, chất liệu...) và cố gắng <strong className="text-white">áp dụng những đặc điểm này lên ảnh nhân vật của bạn.</strong></p>
                    <p className="font-semibold text-white mt-2">Ví dụ:</p>
                    <ul className="list-disc list-inside space-y-1 pl-2">
                        <li><strong>Ảnh nhân vật</strong> + <strong>Ảnh mẫu (phong cảnh anime)</strong> = Nhân vật của bạn xuất hiện trong thế giới anime đó.</li>
                        <li><strong>Ảnh nhân vật</strong> + <strong>Ảnh mẫu (bức tranh sơn dầu)</strong> = Nhân vật của bạn được vẽ lại theo phong cách sơn dầu.</li>
                        <li><strong>Ảnh nhân vật</strong> + <strong>Ảnh mẫu (poster phim)</strong> = Ảnh của bạn sẽ có tông màu và ánh sáng tương tự poster đó.</li>
                    </ul>
                 </div>
            ),
        },
        prompt: {
            title: 'Hướng dẫn Nhập câu lệnh',
            content: (
                <div className="text-sm space-y-3 text-gray-300">
                    <p>Đây là phần bạn "trò chuyện" với AI. Càng mô tả chi tiết và rõ ràng, AI càng hiểu rõ ý bạn. Hãy thử cấu trúc câu lệnh theo các yếu tố sau (dùng tiếng Việt hoặc Anh):</p>
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
                        <li><strong className="text-white">Tỷ lệ khung hình:</strong> Chọn kích thước cho ảnh. <strong className="text-yellow-400">Lưu ý:</strong> Tùy chọn này sẽ bị vô hiệu hóa khi bạn tải lên ảnh nhân vật, vì AI sẽ tự động dùng tỷ lệ của ảnh gốc.</li>
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
             <div className="pt-4 mt-4 border-t border-gray-700">
                <button
                    onClick={onClose}
                    className="w-full py-2 font-bold text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg hover:opacity-90 transition"
                >
                    Đã hiểu!
                </button>
            </div>
        </Modal>
    );
};

export default InstructionModal;