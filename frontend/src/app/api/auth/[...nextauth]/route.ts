import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        // Một ô duy nhất nhận cả email lẫn tên đăng nhập; backend tự nhận diện.
        identifier: { label: 'Email hoặc tên đăng nhập', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.identifier || !credentials?.password) return null;

          const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
          const res = await fetch(`${apiUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: credentials.identifier, password: credentials.password }),
          });

          if (!res.ok) {
            // Ném lỗi kèm thông báo của backend để trang đăng nhập phân biệt được
            // "sai mật khẩu" với "tài khoản bị khoá"; trả null sẽ mất thông tin này.
            const detail = await res.json().catch(() => null);
            const message = Array.isArray(detail?.message) ? detail.message[0] : detail?.message;
            throw new Error(message || 'Tài khoản hoặc mật khẩu không đúng');
          }

          const data = await res.json();
          if (!data.access_token || !data.user) return null;

          return { ...data.user, accessToken: data.access_token };
        } catch (error: any) {
          throw new Error(error?.message || 'Không kết nối được máy chủ');
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // Cố tình KHÔNG lưu avatarUrl vào token. Phiên đăng nhập được ký thành
      // cookie, mà ảnh đại diện là một data URL dài hàng chục nghìn ký tự - nhét
      // vào đây thì cookie phình to tới mức trình duyệt và Next.js từ chối cả
      // request. Ảnh được lấy riêng qua API hồ sơ người dùng.
      if (user) {
        token.accessToken = (user as any).accessToken;
        token.role = (user as any).role;
        token.fullName = (user as any).fullName;
        token.email = (user as any).email;
        token.username = (user as any).username;
        token.companyId = (user as any).companyId;
      }
      if (trigger === 'update' && session?.user) {
        token.fullName = (session.user as any).fullName ?? session.user.name ?? token.fullName;
        token.email = session.user.email ?? token.email;
        token.username = (session.user as any).username ?? token.username;
      }
      return token;
    },
    async session({ session, token }) {
      if (!session.user) return session;
      (session.user as any).accessToken = token.accessToken;
      (session.user as any).role = token.role;
      (session.user as any).id = token.sub;
      (session.user as any).fullName = token.fullName;
      (session.user as any).username = token.username;
      (session.user as any).companyId = token.companyId;
      session.user.name = (token.fullName as string) || session.user.name;
      session.user.email = (token.email as string) || session.user.email;
      return session;
    },
  },
  pages: { signIn: '/login', error: '/login' },
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
