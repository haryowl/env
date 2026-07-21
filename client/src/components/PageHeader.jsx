import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * Reusable page header (title + subtitle + optional right controls)
 * Styled to match the "Realtime Data View" header look.
 */
export default function PageHeader({
  icon,
  title,
  subtitle,
  right,
  sx,
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 1,
        px: 1.5,
        py: 0.65,
        bgcolor: 'background.paper',
        border: '1px solid rgba(0,0,0,0.06)',
        borderRadius: 1,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        ...(sx || {}),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: { xs: '1 1 100%', sm: '1 1 auto' } }}>
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mr: 1,
            bgcolor: 'rgba(37, 99, 235, 0.10)',
            color: 'primary.main',
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, color: 'text.primary', fontSize: '1.05rem', lineHeight: 1.15 }}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography
              sx={{ fontSize: '0.72rem', color: 'text.secondary', wordBreak: 'break-word', display: 'block' }}
            >
              {subtitle}
            </Typography>
          ) : null}
        </Box>
      </Box>
      {right ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            minWidth: 0,
            width: { xs: '100%', sm: 'auto' },
            flex: { xs: '1 1 100%', sm: '0 0 auto' },
          }}
        >
          {right}
        </Box>
      ) : null}
    </Box>
  );
}

