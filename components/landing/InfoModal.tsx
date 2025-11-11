import React from 'react';
import Modal from '../common/Modal';

type InfoKey = 'terms' | 'policy' | 'contact';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  contentKey: InfoKey | null;
}

const InfoModalContent: React.FC<{ contentKey: InfoKey }> = ({ contentKey }) => {
    switch (contentKey) {
        case 'terms':
            return (
                <div className="text-sm text-gray-300 space-y-3 custom-scrollbar pr-2 max-h-[60vh] overflow-y-auto">
                    <p className="font-bold text-white">1. "Kim Cương" là gì?</p>
                    <p>"Kim Cương" là một loại tiền tệ ảo được thiết kế để đáp ứng nhu cầu của người dùng muốn truy cập nhiều hơn vào các dịch vụ của AUDITION AI. "Kim Cương" có thể được sử dụng để quy đổi quyền truy cập vào các tính năng sáng tạo AI trong nền tảng. "Kim Cương" chỉ có thể được nhận và sử dụng bởi người dùng đã đăng nhập.</p>
                    <p>Để tránh hiểu nhầm, dịch vụ Kim Cương không phải là dịch vụ thanh toán trực tuyến, và Kim Cương không phải là token, tiền ảo, hoặc voucher trả trước. Chúng không có giá trị tiền tệ, không thể được chuyển nhượng, tặng, hoàn lại hoặc quy đổi thành tiền mặt.</p>

                    <p className="font-bold text-white mt-4">2. Thời hạn và cách thức sử dụng "Kim Cương"</p>
                    <ul className="list-disc list-inside pl-4 space-y-2">
                        <li><strong>Kim Cương Mua:</strong> Nhận được thông qua việc mua các gói nạp. Có hiệu lực sử dụng trong 2 năm kể từ ngày nhận.</li>
                        <li><strong>Kim Cương Miễn Phí:</strong> Được nhận qua các hoạt động khuyến mãi hoặc ưu đãi hàng ngày của nền tảng. Thời hạn sử dụng sẽ tuân theo quy định của từng chương trình (ví dụ: kim cương miễn phí hàng ngày sẽ được reset sau 24 giờ).</li>
                        <li><strong>Sử dụng Kim Cương:</strong> Việc sử dụng các chức năng sáng tạo AI (như tạo ảnh, tách nền) sẽ tiêu thụ một lượng Kim Cương nhất định. Số Kim Cương tương ứng sẽ bị trừ ngay khi thực hiện thao tác. Nếu thao tác thất bại do lỗi hệ thống, số Kim Cương đã trừ sẽ được hoàn lại vào tài khoản của bạn.</li>
                    </ul>
                    
                    <p className="font-bold text-white mt-4">3. Tiêu chuẩn giá</p>
                    <p>Giá của các gói nạp Kim Cương được niêm yết rõ ràng trên trang "Nạp Kim Cương". Chúng tôi có thể thỉnh thoảng triển khai các hoạt động khuyến mãi với chiết khấu mua hàng. Giá ưu đãi sẽ tuân theo giao diện sản phẩm và các quy tắc hoạt động được công bố tại thời điểm đó.</p>

                    <p className="font-bold text-white mt-4">4. Thứ tự sử dụng</p>
                    <p>Thứ tự ưu tiên sử dụng dựa trên thời hạn của Kim Cương. Những viên Kim Cương có thời hạn sử dụng ngắn hơn (ví dụ: Kim Cương miễn phí hàng ngày) sẽ được hệ thống tự động sử dụng trước.</p>

                    <p className="font-bold text-white mt-4">5. "Kim Cương" được sử dụng cho việc gì?</p>
                    <p>Hiện tại, người dùng có thể sử dụng Kim Cương cho các tính năng sáng tạo AI có sẵn trên nền tảng AUDITION AI, bao gồm nhưng không giới hạn ở việc tạo ảnh và tách nền.</p>
                    
                    <p className="font-bold text-white mt-4">6. Làm thế nào để kiểm tra số dư và chi tiết sử dụng?</p>
                    <p>Bạn có thể kiểm tra số dư Kim Cương hiện tại ở phần đầu trang (Header) khi đã đăng nhập, hoặc xem chi tiết hơn trong trang "Cài đặt tài khoản".</p>
                </div>
            );
        case 'policy':
            return (
                <div className="text-sm text-gray-300 space-y-3 custom-scrollbar pr-2 max-h-[60vh] overflow-y-auto">
                    <p className="font-bold text-white">1. Thu thập thông tin</p>
                    <p>Khi bạn đăng nhập bằng Google, chúng tôi (trong bản demo này) mô phỏng việc thu thập các thông tin cơ bản được Google cho phép, bao gồm:</p>
                    <ul className="list-disc list-inside pl-4">
                        <li>Tên hiển thị</li>
                        <li>Địa chỉ Email</li>
                        <li>Ảnh đại diện (URL)</li>
                    </ul>
                    <p>Chúng tôi không thu thập mật khẩu hay bất kỳ thông tin nhạy cảm nào khác.</p>

                    <p className="font-bold text-white">2. Sử dụng thông tin</p>
                    <p>Thông tin của bạn được sử dụng để:</p>
                     <ul className="list-disc list-inside pl-4">
                        <li>Cá nhân hóa trải nghiệm người dùng.</li>
                        <li>Quản lý tài khoản, bao gồm số dư kim cương và lịch sử tạo ảnh (tính năng mô phỏng).</li>
                        <li>Gửi các thông báo liên quan đến dịch vụ (nếu có).</li>
                    </ul>
                    
                    <p className="font-bold text-white">3. Chia sẻ thông tin</p>
                    <p>Chúng tôi cam kết không bán, trao đổi, hoặc chuyển giao thông tin cá nhân của bạn cho bất kỳ bên thứ ba nào vì mục đích thương mại.</p>
                    
                    <p className="font-bold text-white">4. Bảo mật</p>
                    <p>Đây là một ứng dụng demo và không kết nối với cơ sở dữ liệu thực. Mọi thông tin người dùng chỉ tồn tại trong phiên truy cập của bạn và sẽ mất khi bạn làm mới trang hoặc đăng xuất.</p>
                </div>
            );
        case 'contact':
            return (
                <div className="text-sm text-gray-300 space-y-4">
                    <p>Cảm ơn bạn đã trải nghiệm AUDITION AI! Mọi ý kiến đóng góp, báo lỗi hoặc hợp tác, vui lòng liên hệ với chúng tôi qua các kênh dưới đây.</p>
                    <div className="space-y-3">
                        <div className="bg-white/5 p-3 rounded-lg">
                            <p className="text-gray-400">Người sáng lập & Phát triển</p>
                            <p className="font-semibold text-white">Nguyễn Quốc Cường</p>
                        </div>
                        <div className="bg-white/5 p-3 rounded-lg">
                            <p className="text-gray-400">Số điện thoại</p>
                            <p className="font-semibold text-white">0824.280.497</p>
                        </div>
                        <div className="bg-white/5 p-3 rounded-lg">
                            <p className="text-gray-400">Email</p>
                            <p className="font-semibold text-white">admin@auditionai.io.vn</p>
                        </div>
                         <div className="bg-white/5 p-3 rounded-lg">
                            <p className="text-gray-400">Facebook</p>
                            <a href="https://www.facebook.com/iam.cody.real/" target="_blank" rel="noopener noreferrer" className="font-semibold text-pink-400 hover:underline break-all">https://www.facebook.com/iam.cody.real/</a>
                        </div>
                    </div>
                </div>
            );
        default:
            return null;
    }
};

const getTitle = (key: InfoKey | null): string => {
    switch (key) {
        case 'terms': return 'Chính sách Kim Cương';
        case 'policy': return 'Chính sách Bảo mật';
        case 'contact': return 'Thông tin Liên hệ';
        default: return '';
    }
}

const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose, contentKey }) => {
  if (!isOpen || !contentKey) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={getTitle(contentKey)}>
        <InfoModalContent contentKey={contentKey} />
    </Modal>
  );
};

export default InfoModal;