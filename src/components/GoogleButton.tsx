import { ButtonHTMLAttributes } from 'react';

interface GoogleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string;
}

export function GoogleButton({ 
  text = 'Continue with Google',
  disabled = false,
  ...props 
}: GoogleButtonProps) {
  const handleClick = () => {
    const backendUrl = import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:3001';
    const loginUrl = `${backendUrl}/auth/google/login`;
    console.log('[GoogleButton] Redirecting to:', loginUrl);
    window.location.href = loginUrl;
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-[#DADCE0] rounded-lg font-medium text-[#3C4043] text-sm transition-colors duration-200 hover:bg-[#F7F7F7] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      aria-label={text}
      {...props}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
        aria-hidden="true"
      >
        <g fill="none" fillRule="evenodd">
          <path
            d="M17.64 9.20454545c0-.63818181-.0572727-1.25181818-.164-1.84090909H9v3.48136364h4.8436364c-.2086364.9181818-.8427273 1.6954545-1.7959091 2.2318182v1.8818181h2.9086363c1.7018182-1.5659091 2.6836364-3.8740909 2.6836364-6.59227275z"
            fill="#4285F4"
          />
          <path
            d="M9 18c2.43 0 4.4672727-.8059091 5.9563636-2.1804545l-2.9086363-1.8818182c-.8054546.5395455-1.8359091.8581818-3.0477273.8581818-2.34409091 0-4.32818182-1.5831818-5.03590909-3.7104545H.95727273v1.9418181C2.43818182 15.7831818 5.48181818 18 9 18z"
            fill="#34A853"
          />
          <path
            d="M3.96409091 10.71c-.18-.5395455-.28227273-1.1159091-.28227273-1.71s.10227273-1.1704545.28227273-1.71V5.36909091H.95727273C.34772727 6.57818182 0 7.94863636 0 9.36c0 1.4113636.34772727 2.7818182.95727273 3.99l3.00681818-1.64z"
            fill="#FBBC05"
          />
          <path
            d="M9 3.57954545c1.3213636 0 2.5077273.45409091 3.4404545 1.34590909l2.5813637-2.58136364C13.4627273.89181818 11.4254545 0 9 0 5.48181818 0 2.43818182 2.21681818.95727273 5.36909091l3.00681818 1.94181818C4.67181818 5.16272727 6.65590909 3.57954545 9 3.57954545z"
            fill="#EA4335"
          />
        </g>
      </svg>
      <span>{text}</span>
    </button>
  );
}

