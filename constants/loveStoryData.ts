export interface StoryChoice {
    text: string;
    next: string;
}

export interface StoryNode {
    text: string;
    action?: 'generate';
    prompt?: (femaleName: string, maleName: string) => string;
    next?: string;
    choices?: StoryChoice[];
}

interface Scenario {
    id: string;
    title: string;
    description: string;
    startNode: string;
    nodes: Record<string, StoryNode>;
}

export const SCENARIOS: Record<string, Scenario> = {
    school: {
        id: 'school',
        title: 'Thanh Xuân Vườn Trường',
        description: 'Một câu chuyện tình lãng mạn bắt đầu từ sân trường Audition.',
        startNode: 'start',
        nodes: {
            start: {
                text: 'Trong một chiều mưa tầm tã, Nữ chính vội vã chạy đến phòng tập nhảy thì bất ngờ va phải một người. Cả hai ngã ngồi xuống sàn...',
                action: 'generate',
                prompt: (female, male) => `In a dance practice room with large windows showing heavy rain outside, the female character (${female}) and the male character (${male}) have just collided and are sitting on the polished wooden floor, looking at each other in surprise. Scattered sheets of music are around them. Cinematic, dramatic lighting, anime style.`,
                next: 'choice1',
            },
            choice1: {
                text: '"A... tôi xin lỗi!" Nữ chính luống cuống nói. Chàng trai trước mặt ngước lên, mái tóc ướt nhẹ vì mưa, và nở một nụ cười nhẹ. "Không sao, là lỗi của tôi." Bạn sẽ làm gì?',
                choices: [
                    { text: 'A) "Không, là do tôi vội quá." (Giúp anh ấy nhặt đồ)', next: 'pathA_1' },
                    { text: 'B) Im lặng, vội vàng đứng dậy và rời đi.', next: 'pathB_1' },
                ],
            },
            pathA_1: {
                text: 'Cả hai cùng nhau nhặt lại những tờ giấy nhạc bị rơi. Khi Nữ chính đưa cho anh ấy tờ cuối cùng, tay họ vô tình chạm vào nhau.',
                action: 'generate',
                prompt: (female, male) => `Close-up shot. The female character's (${female}) hand and the male character's (${male}) hand gently touch as they both reach for the same sheet of music on the floor. Soft, romantic lighting, shallow depth of field, detailed anime style.`,
                next: 'choice2_A',
            },
            pathB_1: {
                text: 'Nữ chính vội vã rời đi, nhưng cô lại để quên chiếc khăn quàng cổ của mình. Chàng trai nhặt nó lên, nhìn theo bóng lưng cô, vẻ mặt đầy suy tư.',
                action: 'generate',
                prompt: (female, male) => `The male character (${male}) is alone in the dance room, kneeling on one knee and holding up a pink knitted scarf left behind by the female character (${female}). He looks thoughtfully in the direction she left. Melancholic atmosphere, rain streaking down the windows, anime style.`,
                next: 'end_B',
            },
            choice2_A: {
                text: 'Anh ấy nhìn bạn và nói, "Cảm ơn nhé. Tôi là Nam chính, một thành viên mới của CLB nhảy." Anh ấy chìa tay ra. "Còn bạn?"',
                choices: [
                    { text: 'A) "Tôi là Nữ chính. Rất vui được gặp bạn!" (Bắt tay anh ấy)', next: 'end_A_happy' },
                    { text: 'B) "Chỉ là người qua đường thôi." (Mỉm cười và lùi lại)', next: 'end_A_normal' },
                ]
            },
            end_A_happy: {
                text: 'Một câu chuyện tình yêu mới đã bắt đầu từ đây, dưới cơn mưa chiều và sàn nhảy Audition. (Kết thúc có hậu)',
            },
            end_A_normal: {
                 text: 'Dù có chút tiếc nuối, nhưng cuộc gặp gỡ ngắn ngủi đó đã trở thành một kỷ niệm đẹp. (Kết thúc bình thường)',
            },
            end_B: {
                text: 'Anh ấy giữ chiếc khăn, hy vọng một ngày nào đó sẽ có thể trả lại cho cô gái bí ẩn ấy. (Kết thúc mở)',
            }
        },
    },
};
