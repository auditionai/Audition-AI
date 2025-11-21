
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { AppNotification } from '../../types';
import UserAvatar from '../common/UserAvatar';

interface NotificationDropdownProps {
  onClose: () => void;
  onRead?: () => void;
}

const NotificationDropdown: React.FC<NotificationDropdownProps> = ({ onClose, onRead }) => {
  const { session, showToast, navigate } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (session) {
        fetchNotifications();
    }
  }, [session]);

  const fetchNotifications = async () => {
      try {
          const res = await fetch('/.netlify/functions/get-notifications', {
              headers: { Authorization: `Bearer ${session?.access_token}` }
          });
          if (res.ok) {
              const data = await res.json();
              setNotifications(data);
          }
      } catch (e) {
          console.error(e);
      } finally {
          setIsLoading(false);
      }
  };

  const handleMarkAllRead = async () => {
      try {
          await fetch('/.netlify/functions/mark-notifications-read', {
              method: 'POST',
              headers: { Authorization: `Bearer ${session?.access_token}` }
          });
          setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
          if (onRead) onRead();
      } catch (e) {
          console.error(e);
      }
  };

  const handleNotificationClick = async (notification: AppNotification) => {
      if (!notification.is_read) {
          // Optimistic update
          setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n));
          try {
              await fetch('/.netlify/functions/mark-notifications-read', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                  body: JSON.stringify({ id: notification.id })
              });
          } catch (e) {}
      }

      // Navigation logic based on type
      if (notification.type === 'system') {
          navigate('messages');
      } else {
          // Navigate to profile or specific post if we had a dedicated post page
          // For now, go to profile page of the user (or just close)
          // Ideal: navigate(`post/${notification.entity_id}`);
          // Fallback:
          navigate('profile'); // Or user profile if actor exists
          
          showToast("Tính năng xem chi tiết bài viết từ thông báo đang phát triển.", "success");
      }
      onClose();
  };

  const getNotificationContent = (n: AppNotification) => {
      const actorName = n.actor?.display_name || 'Ai đó';
      switch (n.type) {
          case 'like': return <span><span className="font-bold text-white">{actorName}</span> đã thích bài viết của bạn.</span>;
          case 'comment': return <span><span className="font-bold text-white">{actorName}</span> đã bình luận về bài viết của bạn.</span>;
          case 'reply': return <span><span className="font-bold text-white">{actorName}</span> đã trả lời bình luận của bạn.</span>;
          case 'share': return <span><span className="font-bold text-white">{actorName}</span> đã chia sẻ bài viết của bạn.</span>;
          case 'system': return <span className="text-yellow-300">{n.content}</span>;
          case 'follow': return <span><span className="font-bold text-white">{actorName}</span> đã theo dõi bạn.</span>;
          default: return <span>{n.content}</span>;
      }
  };

  const getIcon = (type: string) => {
      switch (type) {
          case 'like': return <i className="ph-fill ph-heart text-red-500"></i>;
          case 'comment': 
          case 'reply': return <i className="ph-fill ph-chat-circle text-blue-400"></i>;
          case 'share': return <i className="ph-fill ph-share-network text-green-400"></i>;
          case 'system': return <i className="ph-fill ph-bell text-yellow-400"></i>;
          default: return <i className="ph-fill ph-info text-gray-400"></i>;
      }
  };

  return (
    <div className="absolute right-0 mt-3 top-full w-80 sm:w-96 origin-top-right bg-[#1e1b25] border border-white/10 rounded-md shadow-lg z-50 animate-fade-in-down">
      <div className="p-4 border-b border-white/10 flex justify-between items-center">
        <h3 className="font-bold text-white">Thông báo</h3>
        <div className="flex gap-3">
            <button onClick={handleMarkAllRead} className="text-xs text-pink-400 hover:text-pink-300">Đã đọc tất cả</button>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                <i className="ph-fill ph-x"></i>
            </button>
        </div>
      </div>
      <div className="p-0 max-h-96 overflow-y-auto custom-scrollbar">
        {isLoading ? (
            <div className="p-4 text-center text-skin-muted text-xs">Đang tải...</div>
        ) : notifications.length === 0 ? (
            <div className="p-8 text-center text-skin-muted">
                <i className="ph-fill ph-bell-slash text-4xl mb-2 opacity-50"></i>
                <p className="text-sm">Chưa có thông báo mới</p>
            </div>
        ) : (
            notifications.map(item => (
                <div 
                    key={item.id} 
                    onClick={() => handleNotificationClick(item)}
                    className={`p-3 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer flex gap-3 ${!item.is_read ? 'bg-pink-500/5' : ''}`}
                >
                    <div className="flex-shrink-0 relative">
                        {item.type === 'system' ? (
                            <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center border border-yellow-500/50">
                                <i className="ph-fill ph-bell text-yellow-400"></i>
                            </div>
                        ) : (
                            <UserAvatar url={item.actor?.photo_url || ''} alt="Actor" size="sm" />
                        )}
                        <div className="absolute -bottom-1 -right-1 bg-[#1e1b25] rounded-full p-0.5">
                            {getIcon(item.type)}
                        </div>
                    </div>
                    <div className="flex-grow">
                        <p className="text-sm text-gray-300 leading-snug">
                            {getNotificationContent(item)}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1">
                            {new Date(item.created_at).toLocaleString('vi-VN')}
                        </p>
                    </div>
                    {!item.is_read && (
                        <div className="flex-shrink-0 self-center">
                            <div className="w-2 h-2 bg-pink-500 rounded-full"></div>
                        </div>
                    )}
                </div>
            ))
        )}
      </div>
    </div>
  );
};

export default NotificationDropdown;
