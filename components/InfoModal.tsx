import React from 'react';
import Modal from './common/Modal';

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
                    <p className="font-bold text-white">1. Chấp nhận Điều khoản</p>
                    <p>Bằng việc truy cập và sử dụng dịch vụ AUDITION AI ("Dịch vụ"), bạn đồng ý tuân thủ các điều khoản và điều kiện này. Nếu bạn không đồng ý, vui lòng không sử dụng Dịch vụ.</p>
                    
                    <p className="font-bold text-white">2. Trách nhiệm người dùng</p>
                    <ul className="list-disc list-inside pl-4">
                        <li>Bạn hoàn toàn chịu trách nhiệm về bản quyền và tính hợp pháp của hình ảnh bạn tải lên.</li>
                        <li>Nghiêm cấm sử dụng Dịch vụ để tạo ra nội dung bất hợp pháp, vi phạm pháp luật, 18+, bạo lực, xúc phạm, phỉ báng hoặc vi phạm quyền của bất kỳ bên thứ ba nào.</li>
                        <li>Bạn đồng ý không sử dụng Dịch vụ cho bất kỳ mục đích thương mại nào mà không có sự cho phép trước của chúng tôi.</li>
                    </ul>

                    <p className="font-bold text-white">3. Giới hạn Dịch vụ</p>
                     <ul className="list-disc list-inside pl-4">
                        <li>Đây là một phiên bản DEMO. Các chức năng, dữ liệu và kết quả có thể không chính xác và chỉ nhằm mục đích minh họa.</li>
                        <li>Chất lượng hình ảnh do AI tạo ra phụ thuộc vào nhiều yếu tố và không được đảm bảo luôn hoàn hảo hoặc đúng ý bạn 100%.</li>
                        <li>Chúng tôi có quyền sửa đổi hoặc chấm dứt Dịch vụ bất kỳ lúc nào mà không cần thông báo trước.</li>
                    </ul>

                    <p className="font-bold text-white">4. Miễn trừ trách nhiệm</p>
                    <p>AUDITION AI không chịu trách nhiệm cho bất kỳ thiệt hại nào phát sinh từ việc sử dụng hoặc không thể sử dụng Dịch vụ.</p>
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
        case 'terms': return 'Điều khoản Dịch vụ';
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