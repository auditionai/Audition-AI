import React, { useState, useRef, useEffect } from 'react';

interface SignatureSettingsProps {
    text: string; onTextChange: (value: string) => void;
    style: string; onStyleChange: (value: string) => void;
    position: string; onPositionChange: (value: string) => void;
    color: string; onColorChange: (value: string) => void;
    customColor: string; onCustomColorChange: (value: string) => void;
    size: string; onSizeChange: (value: string) => void;
}

const SignatureSettings: React.FC<SignatureSettingsProps> = (props) => {
    const { 
        text, onTextChange, style, onStyleChange, position, onPositionChange, 
        color, onColorChange, customColor, onCustomColorChange, size, onSizeChange 
    } = props;
    
    const [isStyleOpen, setIsStyleOpen] = useState(false);
    const [isPositionOpen, setIsPositionOpen] = useState(false);
    const styleRef = useRef<HTMLDivElement>(null);
    const positionRef = useRef<HTMLDivElement>(null);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (styleRef.current && !styleRef.current.contains(event.target as Node)) setIsStyleOpen(false);
            if (positionRef.current && !positionRef.current.contains(event.target as Node)) setIsPositionOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const styles = [
        { label: 'Phong cách Phổ biến', options: [
            { id: 'handwritten', name: 'Chữ viết tay' }, { id: 'sans_serif', name: 'Chữ không chân' },
            { id: 'bold', name: 'Chữ in đậm' }, { id: 'vintage', name: 'Chữ vintage' }, { id: '3d', name: 'Chữ 3D' }
        ]},
        { label: 'Phong cách Độc đáo', options: [
            { id: 'messy', name: 'Chữ lộn xộn' }, { id: 'outline', name: 'Chữ outline' }, { id: 'teen_code', name: 'Teen code' }
        ]},
        { label: 'Phong cách Kết hợp', options: [
            { id: 'mixed', name: 'Phối hợp nhiều font' }
        ]}
    ];
    
    const positions = [
        { id: 'random', name: 'Ngẫu nhiên' }, { id: 'bottom_right', name: 'Góc dưới phải' },
        { id: 'bottom_left', name: 'Góc dưới trái' }, { id: 'top_right', name: 'Góc trên phải' },
        { id: 'top_left', name: 'Góc trên trái' }, { id: 'center', name: 'Ở giữa' }
    ];

    const allStyles = styles.flatMap(group => group.options);

    return (
        <div className="space-y-4 border-t border-b border-white/10 py-4">
            <h4 className="text-sm font-semibold text-gray-300">Chữ ký trong ảnh</h4>
            <div>
                <input type="text" value={text} onChange={e => onTextChange(e.target.value)} placeholder="Nhập chữ ký của bạn..." className="w-full p-2 bg-black/30 rounded-md border border-gray-600 focus:border-pink-500 transition text-sm text-white" maxLength={25} />
            </div>

            <div className="grid grid-cols-2 gap-4">
                 <div className="relative" ref={styleRef}>
                    <label className="text-xs font-semibold text-gray-400 mb-1 block">Kiểu chữ</label>
                    <button onClick={() => setIsStyleOpen(!isStyleOpen)} className="custom-select-trigger !text-xs !py-1.5">
                        <span>{allStyles.find(s => s.id === style)?.name}</span>
                        <i className={`ph-fill ph-caret-down transition-transform ${isStyleOpen ? 'rotate-180' : ''}`}></i>
                    </button>
                    {isStyleOpen && (
                        <div className="custom-select-options">
                            {styles.map(group => (
                                <div key={group.label}>
                                    <h5 className="text-xs text-gray-500 font-bold px-4 pt-2 pb-1">{group.label}</h5>
                                    {group.options.map(s => (
                                        <button key={s.id} onClick={() => { onStyleChange(s.id); setIsStyleOpen(false); }} className={`custom-select-option ${style === s.id ? 'active' : ''}`}>
                                            <span>{s.name}</span>{style === s.id && <i className="ph-fill ph-check"></i>}
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                 <div className="relative" ref={positionRef}>
                    <label className="text-xs font-semibold text-gray-400 mb-1 block">Vị trí</label>
                    <button onClick={() => setIsPositionOpen(!isPositionOpen)} className="custom-select-trigger !text-xs !py-1.5">
                        <span>{positions.find(p => p.id === position)?.name}</span>
                        <i className={`ph-fill ph-caret-down transition-transform ${isPositionOpen ? 'rotate-180' : ''}`}></i>
                    </button>
                    {isPositionOpen && (
                        <div className="custom-select-options">
                            {positions.map(p => (
                                <button key={p.id} onClick={() => { onPositionChange(p.id); setIsPositionOpen(false); }} className={`custom-select-option ${position === p.id ? 'active' : ''}`}>
                                    <span>{p.name}</span>{position === p.id && <i className="ph-fill ph-check"></i>}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div>
                <label className="text-xs font-semibold text-gray-400 mb-2 block">Màu sắc</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                    {(['default', 'random', 'rainbow', 'custom'] as const).map(c => (
                        <button key={c} onClick={() => onColorChange(c)} className={`p-2 rounded-md font-semibold text-center border-2 transition ${color === c ? 'border-pink-500 bg-pink-500/10 text-pink-300' : 'border-gray-600 bg-white/5 hover:bg-white/10 text-gray-300'}`}>
                            {c === 'default' && 'Mặc định'}
                            {c === 'random' && 'Ngẫu nhiên'}
                            {c === 'rainbow' && '7 sắc cầu vồng'}
                            {c === 'custom' && 'Tùy chọn'}
                        </button>
                    ))}
                </div>
                {color === 'custom' && (
                     <div className="mt-2 flex items-center gap-2 bg-black/30 p-2 rounded-md border border-gray-600">
                        <input type="color" value={customColor} onChange={e => onCustomColorChange(e.target.value)} className="w-8 h-8 p-0 border-none rounded cursor-pointer" />
                        <span className="font-mono text-white">{customColor.toUpperCase()}</span>
                    </div>
                )}
            </div>
            
             <div>
                <label className="text-xs font-semibold text-gray-400 mb-2 block">Kích thước</label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                    {(['small', 'medium', 'large'] as const).map(s => (
                        <button key={s} onClick={() => onSizeChange(s)} className={`p-2 rounded-md font-semibold text-center border-2 transition ${size === s ? 'border-pink-500 bg-pink-500/10 text-pink-300' : 'border-gray-600 bg-white/5 hover:bg-white/10 text-gray-300'}`}>
                            {s === 'small' && 'Nhỏ'}
                            {s === 'medium' && 'Vừa'}
                            {s === 'large' && 'To'}
                        </button>
                    ))}
                </div>
            </div>

        </div>
    );
};

export default SignatureSettings;