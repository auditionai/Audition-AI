import React from 'react';
import Modal from '../common/Modal';

type InstructionKey = 'character' | 'style' | 'prompt' | 'advanced' | 'face';

interface InstructionModalProps {
    isOpen: boolean;
    onClose: () => void;
    instructionKey: InstructionKey | null;
}

const getInstructionContent = (key: InstructionKey | null) => {
    if (!key) return { title: 'Hướng dẫn', content: null };

    const contentMap: { [k in InstructionKey]: { title: string; content: React.ReactNode } } = {
        face: {
            title: 'Hướng dẫn Siêu Khóa Gương Mặt',
            content: (
                <div className="text-sm space-y-4 text-gray-300">
                    <div>
                        <p className="font-semibold text-white mb-2">Để đạt độ chính xác gương mặt cao nhất (95%+), hãy tải lên một ảnh chân dung:</p>
                        <ul className="list-disc list-inside space-y-1 pl-2">
                            <li><span className="text-green-400">Đã được crop (cắt) chỉn chu, chỉ lấy phần đầu.</span></li>
                            <li>Chụp <span className="text-green-400">chính diện, rõ nét,</span> không bị mờ nhòe.</li>
                            <li>Gương mặt <span className="text-green-400">không bị tóc, tay, hoặc vật thể khác che khuất.</span></li>
                            <li><span className="text-green-400">Ánh sáng tốt,</span> không quá tối hoặc cháy sáng.</li>
                        </ul>
                    </div>
                     <div>
                        <h4 className="font-semibold text-pink-400 mb-2">Quy trình hoạt động:</h4>
                        <p>
                           Khi bạn cung cấp ảnh chân dung tham chiếu, một quy trình AI 2 bước sẽ được kích hoạt. AI #1 tạo ra bối cảnh, quần áo. Sau đó, AI #2 chuyên biệt sẽ <strong className="text-white">"ghép" gương mặt tham chiếu của bạn vào ảnh đã tạo</strong> một cách chính xác, đồng thời hòa trộn ánh sáng và màu sắc để có kết quả tự nhiên nhất.
                        </p>
                    </div>
                    <p className="pt-3 border-t border-white/10"><strong className="text-yellow-400">Lưu ý:</strong> Chức năng này là một tính năng cao cấp và sẽ tốn thêm <span className="font-semibold">1 Kim cương</span> cho mỗi lần sử dụng, nâng tổng chi phí lên 2 Kim cương.</p>
                </div>
            )
        },
        character: {
            title: 'Hướng dẫn Tải ảnh Toàn thân',
            content: (
                <div className="text-sm space-y-4 text-gray-300">
                    <div>
                        <p className="font-semibold text-white mb-2">Mục đích của ảnh này là để AI tham khảo về trang phục và tư thế, không phải gương mặt.</p>
                        <ul className="list-disc list-inside space-y-1 pl-2">
                            <li>AI sẽ cố gắng "học" theo <span className="text-green-400">kiểu dáng quần áo, phụ kiện và cách tạo dáng</span> từ ảnh này.</li>
                            <li>Bạn có thể tải lên ảnh nhân vật đã được tách nền để có kết quả tốt nhất.</li>
                            <li>Nếu bạn chỉ muốn AI tham khảo tư thế, hãy mô tả chi tiết trang phục trong câu lệnh.</li>
                        </ul>
                    </div>
                     <div>
                        <h4 className="font-semibold text-pink-400 mb-2">Kết hợp với Face ID:</h4>
                        <p>
                           Cách dùng hiệu quả nhất là kết hợp cả hai: Tải ảnh chân dung vào ô "Siêu Khóa Gương Mặt" và tải ảnh nhân vật game của bạn vào ô này. AI sẽ lấy gương mặt từ ảnh chân dung và lấy trang phục/tư thế từ ảnh toàn thân.
                        </p>
                    </div>
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
                        <li><strong className="text-white">Siêu Khóa Gương Mặt:</strong> Kích hoạt quy trình AI 2 bước để đảm bảo độ chính xác gương mặt cao nhất. Tắt tùy chọn này nếu bạn chỉ muốn tạo ảnh nhanh và không quá đặt nặng vào việc giữ lại chính xác 100% gương mặt.</li>
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