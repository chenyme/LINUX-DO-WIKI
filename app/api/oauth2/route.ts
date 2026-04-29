import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// OAuth2配置
const OAUTH2_CONFIG = {
  clientId: process.env.OAUTH_CLIENT_ID || '',
  clientSecret: process.env.OAUTH_CLIENT_SECRET || '',
  authorizeEndpoint: 'https://connect.linux.do/oauth2/authorize',
  tokenEndpoint: 'https://connect.linux.do/oauth2/token',
  userInfoEndpoint: 'https://connect.linux.do/api/user',
  redirectUri: '',
  scope: 'profile'
};

// 生成随机状态值以防止CSRF攻击
function generateState(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// 授权请求处理
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action');
  
  // 处理登出请求
  if (action === 'logout') {
    const cookieStore = await cookies();
    cookieStore.set('oauth_user', '', { expires: new Date(0) });
    cookieStore.set('oauth_token', '', { expires: new Date(0) });
    
    // 获取重定向URL，默认为/tools
    const redirectTo = searchParams.get('redirect') || '/tools';
    const logoutBaseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin;
    return NextResponse.redirect(new URL(redirectTo, logoutBaseUrl));
  }
  
  // 生成状态值并存储在cookie中
  const state = generateState();
  const cookieStore = await cookies();
  cookieStore.set('oauth_state', state, { 
    httpOnly: true, 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10, // 10分钟有效期
    path: '/'
  });
  
  // 获取重定向URL，用于登录后返回
  const redirectAfterLogin = searchParams.get('redirect') || '/tools';
  cookieStore.set('redirect_after_login', redirectAfterLogin, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10, // 10分钟有效期
    path: '/'
  });
  
  // 构建授权URL
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin;
  const redirectUri = `${baseUrl}/api/oauth2/callback`;
  const authUrl = new URL(OAUTH2_CONFIG.authorizeEndpoint);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('client_id', OAUTH2_CONFIG.clientId);
  authUrl.searchParams.append('redirect_uri', redirectUri);
  authUrl.searchParams.append('state', state);
  authUrl.searchParams.append('scope', OAUTH2_CONFIG.scope);
  
  // 重定向到授权服务器
  return NextResponse.redirect(authUrl);
}

// 处理授权回调
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code } = body;
    
    if (!code) {
      return NextResponse.json({ error: 'Authorization code is required' }, { status: 400 });
    }
    
    // 交换授权码获取访问令牌
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin;
    const redirectUri = `${baseUrl}/api/oauth2/callback`;
    const tokenResponse = await fetch(OAUTH2_CONFIG.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: OAUTH2_CONFIG.clientId,
        client_secret: OAUTH2_CONFIG.clientSecret,
        code,
        redirect_uri: redirectUri
      })
    });
    
    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      return NextResponse.json({ error: 'Failed to exchange token', details: errorData }, { status: 400 });
    }
    
    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;
    
    // 获取用户信息
    const userInfoResponse = await fetch(OAUTH2_CONFIG.userInfoEndpoint, {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });
    
    if (!userInfoResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch user info' }, { status: 400 });
    }
    
    const userData = await userInfoResponse.json();
    
    const cookieStore = await cookies();
    // 设置用户信息和令牌到cookie
    cookieStore.set('oauth_token', JSON.stringify({
      access_token,
      refresh_token,
      expires_at: Date.now() + expires_in * 1000
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: expires_in,
      path: '/'
    });
    
    // 用户公开信息存储在非httpOnly cookie中，以便客户端JavaScript访问
    cookieStore.set('oauth_user', JSON.stringify({
      id: userData.id,
      name: userData.name || userData.username,
      username: userData.username,
      avatar: userData.avatar_url || userData.avatar
    }), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      maxAge: expires_in,
      path: '/'
    });
    
    return NextResponse.json({ success: true, user: userData });
    
  } catch (error) {
    console.error('OAuth error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 
