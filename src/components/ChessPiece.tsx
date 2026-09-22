'use client';

import React from 'react';

interface ChessPieceProps {
  piece: string; // 'wp', 'wn', 'wb', 'wr', 'wq', 'wk', 'bp', 'bn', 'bb', 'br', 'bq', 'bk'
  className?: string;
  size?: number | string;
}

export function ChessPiece({ piece, className = 'w-full h-full p-1', size }: ChessPieceProps) {
  const isWhite = piece.startsWith('w');
  const type = piece.charAt(1).toLowerCase();

  // White gradient: Warm ivory to cream with soft specular highlight
  // Black gradient: Deep charcoal/obsidian with subtle slate sheen
  const whiteFill = 'url(#whitePieceGrad)';
  const blackFill = 'url(#blackPieceGrad)';
  const fill = isWhite ? whiteFill : blackFill;
  const stroke = isWhite ? '#36322d' : '#141312';
  const innerStroke = isWhite ? '#ffffff' : '#57534e';

  return (
    <svg
      viewBox="0 0 45 45"
      width={size}
      height={size}
      className={`${className} select-none drop-shadow-md transition-transform duration-150 hover:scale-105`}
      aria-hidden="true"
    >
      <defs>
        {/* White Piece Gradient: Warm ivory with subtle 3D lighting */}
        <linearGradient id="whitePieceGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#f7f4ed" />
          <stop offset="85%" stopColor="#e3dac9" />
          <stop offset="100%" stopColor="#cfc4b0" />
        </linearGradient>

        {/* Black Piece Gradient: Charcoal to deep obsidian */}
        <linearGradient id="blackPieceGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#44403c" />
          <stop offset="25%" stopColor="#292524" />
          <stop offset="80%" stopColor="#1c1917" />
          <stop offset="100%" stopColor="#0c0a09" />
        </linearGradient>

        {/* Soft Drop Shadow Filter for 3D depth */}
        <filter id="pieceShadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1" floodColor="#000000" floodOpacity="0.45" />
        </filter>
      </defs>

      <g filter="url(#pieceShadow)">
        {/* Pawn */}
        {type === 'p' && (
          <path
            d="m 22.5,9 c -2.21,0 -4,1.79 -4,4 0,0.89 0.29,1.71 0.78,2.38 C 17.33,16.5 16,18.59 16,21 c 0,2.03 0.94,3.84 2.41,5.03 C 15.41,27.09 11,31.58 11,39.5 l 23,0 c 0,-7.92 -4.41,-12.41 -7.41,-13.47 C 28.06,24.84 29,23.03 29,21 29,18.59 27.67,16.5 25.72,15.38 26.21,14.71 26.5,13.89 26.5,13 c 0,-2.21 -1.79,-4 -4,-4 z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Knight */}
        {type === 'n' && (
          <path
            d="m 22,10 c 10.5,1 16.5,8 16,29 l -23,0 c 0,-9 10,-6.5 8,-21 m -5,4.5 c 0,0 0.5,-2 2,-2 m 2,2 c 0,0 0.5,-2 2,-2 m -7.5,7 c 0,0 3.5,0.5 4,4 c 0,0 -4,0.5 -4,-4 z M 9.5,25.5 A 0.5,0.5 0 1 1 8.5,25.5 A 0.5,0.5 0 1 1 9.5,25.5 z M 15,15.5 C 15,17 14,18 12.5,18 C 11,18 10,17 10,15.5 C 10,14 11,13 12.5,13 C 14,13 15,14 15,15.5 z M 24.5,14 c 0,0 -3,-3 -9,-0.5 c -2,0.8 -6,6.5 -6,12 c 0,4 3,6 4.5,6 c 1.5,0 3.5,-1 3.5,-1 l 0.5,2 c 0,0 -2.5,1.5 -2.5,3.5 c 0,2 1.5,3.5 3.5,3.5 c 2,0 4,-1 5,-2 c 1,-1 3,-5.5 3,-5.5"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Bishop */}
        {type === 'b' && (
          <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 9,36 C 12.39,35.03 19.11,36.43 22.5,34 C 25.89,36.43 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.14,39.5 36,39.5 C 31.5,39.5 13.5,39.5 9,39.5 C 7.86,39.5 6.68,38.97 6,38 C 7.35,36.54 9,36 9,36 z" />
            <path d="M 12,36 C 12.27,34.01 13.41,31.78 14.5,30 C 17,26 16.5,21 16.5,21 C 16.5,21 15,20.5 14,19.5 C 13,18.5 12.5,17 12.5,15.5 C 12.5,13.5 14,12 16,12 C 17,12 18,12.5 18.5,13.5 C 19.5,12 21,11 22.5,11 C 24,11 25.5,12 26.5,13.5 C 27,12.5 28,12 29,12 C 31,12 32.5,13.5 32.5,15.5 C 32.5,17 32,18.5 31,19.5 C 30,20.5 28.5,21 28.5,21 C 28.5,21 28,26 30.5,30 C 31.59,31.78 32.73,34.01 33,36" />
            <path d="M 22.5,11 L 22.5,6" strokeWidth="1.8" />
            <path d="M 20,8 L 25,8" strokeWidth="1.8" />
            <path d="M 17.5,26 L 27.5,26" stroke={innerStroke} strokeWidth="1.2" />
            <path d="M 22.5,15.5 C 20.5,19 19,25.5 25,24" fill="none" stroke={innerStroke} strokeWidth="1.2" />
          </g>
        )}

        {/* Rook */}
        {type === 'r' && (
          <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 9,39 L 36,39 L 36,36 L 9,36 z" />
            <path d="M 12,36 L 12,32 L 33,32 L 33,36 z" />
            <path d="M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14" />
            <path d="M 34,14 L 31,17 L 14,17 L 11,14" />
            <path d="M 14,17 L 14,29.5 L 31,29.5 L 31,17" />
            <path d="M 14,29.5 L 12,32 L 33,32 L 31,29.5" />
            <path d="M 14,17 L 31,17" stroke={innerStroke} strokeWidth="1" />
            <path d="M 14,29.5 L 31,29.5" stroke={innerStroke} strokeWidth="1" />
          </g>
        )}

        {/* Queen */}
        {type === 'q' && (
          <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="12" r="2.2" />
            <circle cx="14" cy="9" r="2.2" />
            <circle cx="22.5" cy="8" r="2.2" />
            <circle cx="31" cy="9" r="2.2" />
            <circle cx="39" cy="12" r="2.2" />
            <path d="M 9,26 C 9,28 10.5,28 11.5,30 C 12.5,31.5 12.5,31 12,33.5 C 10.5,34.5 10.5,36 10,36 C 9,36 9,37.5 9,38.5 L 36,38.5 C 36,37.5 36,36 35,36 C 34.5,36 34.5,34.5 33,33.5 C 32.5,31 32.5,31.5 33.5,30 C 34.5,28 36,28 36,26 C 35.5,23.5 30,19 30,19 L 22.5,24 L 15,19 C 15,19 9.5,23.5 9,26 z" />
            <path d="M 6,12 L 11.5,25.5 L 14,9 L 22.5,21.5 L 31,9 L 33.5,25.5 L 39,12" fill="none" strokeWidth="1.5" />
            <path d="M 11.5,30 C 15,29 30,29 33.5,30" fill="none" stroke={innerStroke} strokeWidth="1.2" />
            <path d="M 12,33.5 C 18,32.5 27,32.5 33,33.5" fill="none" stroke={innerStroke} strokeWidth="1.2" />
          </g>
        )}

        {/* King */}
        {type === 'k' && (
          <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {/* Cross */}
            <path d="M 22.5,5 L 22.5,11" strokeWidth="2" />
            <path d="M 19.5,8 L 25.5,8" strokeWidth="2" />
            <path d="M 11.5,37 C 17,40.5 28,40.5 33.5,37 C 35.5,35 34.5,34 34.5,34 C 34.5,34 35.5,32 34.5,30.5 C 33.5,29 31.5,28 31.5,28 C 31.5,28 33,26 31.5,24 C 30,22 28.5,22 28.5,22 C 28.5,22 30.5,18 29.5,15.5 C 28.5,13 25.5,12.5 22.5,12.5 C 19.5,12.5 16.5,13 15.5,15.5 C 14.5,18 16.5,22 16.5,22 C 16.5,22 15,22 13.5,24 C 12,26 13.5,28 13.5,28 C 13.5,28 11.5,29 10.5,30.5 C 9.5,32 10.5,34 10.5,34 C 10.5,34 9.5,35 11.5,37 z" />
            <path d="M 11.5,30 C 17,27 28,27 33.5,30" fill="none" stroke={innerStroke} strokeWidth="1.2" />
            <path d="M 11.5,33.5 C 17,31 28,31 33.5,33.5" fill="none" stroke={innerStroke} strokeWidth="1.2" />
            <path d="M 11.5,37 C 17,35 28,35 33.5,37" fill="none" stroke={innerStroke} strokeWidth="1.2" />
          </g>
        )}
      </g>
    </svg>
  );
}
