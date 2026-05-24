import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { colors } from '../theme.js';

export default function TextPrompt({ label, hint, initialValue = '', placeholder, onSubmit, onCancel }) {
    const [value, setValue] = useState(initialValue);
    return (
        <Box
            borderStyle="single"
            borderColor={colors.modalBorder}
            flexDirection="column"
            paddingX={2}
            width={48}
            backgroundColor={colors.modalBg}
            borderBackgroundColor={colors.modalBg}
        >
            <Text bold color={colors.title}>{label}</Text>
            <Text> </Text>
            {hint && <Text color={colors.modalFg}>{hint}</Text>}
            <Box>
                <Text color={colors.value}>› </Text>
                <TextInput
                    value={value}
                    placeholder={placeholder || ''}
                    onChange={setValue}
                    onSubmit={(v) => onSubmit(v)}
                />
            </Box>
            <Text> </Text>
            <Text color={colors.title}>Enter=apply  Esc=cancel</Text>
        </Box>
    );
}
