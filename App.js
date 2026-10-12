import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, StatusBar,
  KeyboardAvoidingView, Platform, SafeAreaView, Animated, PanResponder,
  Alert, ScrollView, LayoutAnimation, Keyboard, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from './lib/supabase';

// Centralized dark design tokens for Zou's conversation-first interface.
const BLUE = '#07C160';
const BG = '#111111';
const SURFACE = '#1B1B1B';
const TEXT = '#F5F5F5';
const SUB = '#939393';
const LINE = '#2B2B2B';
const RED = '#FA5151';
const ME = 'Tôi';

const AVATAR_COLORS = ['#F4B400', '#34A853', '#EA4335', '#9C27B0', '#00ACC1', '#FF7043', '#5C6BC0'];
const colorFor = (s) => AVATAR_COLORS[(s.charCodeAt(0) + s.length) % AVATAR_COLORS.length];
const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const pad = (n) => String(n).padStart(2, '0');
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ago = (ts) => {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'Vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} giờ trước` : `${Math.floor(h / 24)} ngày trước`;
};
const sortMsgs = (arr) => arr.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
const mergeMax = (a = {}, b = {}) => {
  const out = { ...a };
  for (const k in b) out[k] = Math.max(out[k] || 0, b[k] || 0);
  return out;
};


const INITIAL_POSTS = [];

const vi = (m = '') => {
  if (m.includes('Invalid login')) return 'Sai email hoặc mật khẩu';
  if (m.includes('already registered')) return 'Email này đã được đăng ký';
  if (m.includes('at least 6')) return 'Mật khẩu tối thiểu 6 ký tự';
  if (m.includes('valid email') || m.includes('invalid format')) return 'Email không hợp lệ';
  if (m.includes('Email not confirmed')) return 'Bạn chưa xác nhận email';
  return m;
};

/* ---------- Thành phần nhỏ ---------- */
function Avatar({ name, size = 48 }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colorFor(name), alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: size * 0.42, fontWeight: '600' }}>{name.trim().split(' ').pop()[0]}</Text>
    </View>
  );
}

function Header({ title = 'Zou', onSearch, right }) {
  return (
    <View style={s.header}>
      <Text style={s.headerTitle}>{title}</Text>
      <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center' }}>{right}</View>
    </View>
  );
}

function Empty({ icon, title, sub, action, onAction }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: BG }}>
      <View style={{ width: 84, height: 84, borderRadius: 24, backgroundColor: '#173A26', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={46} color={BLUE} />
      </View>
      <Text style={{ fontSize: 18, fontWeight: '600', color: TEXT, marginTop: 18 }}>{title}</Text>
      <Text style={{ fontSize: 14, color: SUB, textAlign: 'center', marginTop: 6 }}>{sub}</Text>
      {action && (
        <TouchableOpacity style={s.primaryBtn} onPress={onAction}>
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/* ---------- Vuốt để xóa / đánh dấu đã đọc ---------- */
const ACTION_W = 140;
function SwipeRow({ children, onPress, onDelete, onRead }) {
  const x = useRef(new Animated.Value(0)).current;
  const open = useRef(false);
  const snap = (to) => {
    open.current = to !== 0;
    Animated.spring(x, { toValue: to, useNativeDriver: true, bounciness: 0, speed: 18 }).start();
  };
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => {
      const base = open.current ? -ACTION_W : 0;
      x.setValue(Math.max(-ACTION_W - 24, Math.min(0, base + g.dx)));
    },
    onPanResponderRelease: (_, g) => {
      const end = (open.current ? -ACTION_W : 0) + g.dx;
      snap(end < -ACTION_W / 2 ? -ACTION_W : 0);
    },
    onPanResponderTerminate: () => snap(open.current ? -ACTION_W : 0),
  })).current;

  return (
    <View style={{ overflow: 'hidden', backgroundColor: SURFACE }}>
      <View style={s.actions}>
        <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#6B8FBF' }]} onPress={() => { snap(0); onRead(); }}>
          <Ionicons name="checkmark-done" size={22} color="#fff" />
          <Text style={s.actionText}>Đã đọc</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.actionBtn, { backgroundColor: RED }]} onPress={onDelete}>
          <Ionicons name="trash-outline" size={22} color="#fff" />
          <Text style={s.actionText}>Xóa</Text>
        </TouchableOpacity>
      </View>
      <Animated.View style={{ transform: [{ translateX: x }], backgroundColor: SURFACE }} {...pan.panHandlers}>
        <TouchableOpacity activeOpacity={0.6} onPress={() => (open.current ? snap(0) : onPress())}>
          {children}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

/* ---------- Tab Tin nhắn ---------- */
function Messages({ chats, nameOf, onOpen, onSearch, onAdd, onDelete, onRead, goContacts }) {
  const list = Object.entries(chats)
    .filter(([, c]) => c.messages.length > 0)
    .sort((a, b) => b[1].ts - a[1].ts);
  return (
    <View style={{ flex: 1 }}>
      <Header title="Zou" onSearch={onSearch} right={[
        <TouchableOpacity key="search" onPress={onSearch} accessibilityLabel="Tìm kiếm"><Ionicons name="search-outline" size={25} color={TEXT} /></TouchableOpacity>,
        <TouchableOpacity key="add" onPress={onAdd} accessibilityLabel="Thêm bạn"><Ionicons name="add-circle-outline" size={27} color={TEXT} /></TouchableOpacity>,
      ]} />
      {list.length === 0 ? (
        <Empty icon="chatbubbles-outline" title="Chưa có tin nhắn" sub="Hãy chọn một người bạn trong danh bạ để bắt đầu trò chuyện." action="Tìm bạn bè" onAction={goContacts} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={([id]) => id}
          renderItem={({ item: [id, c] }) => {
            const last = c.messages[c.messages.length - 1];
            return (
              <SwipeRow onPress={() => onOpen(id)} onDelete={() => onDelete(id)} onRead={() => onRead(id)}>
                <View style={s.row}>
                  <Avatar name={nameOf(id)} size={52} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.name} numberOfLines={1}>{nameOf(id)}</Text>
                    <Text style={[s.last, c.unread > 0 && { color: TEXT, fontWeight: '600' }]} numberOfLines={1}>
                      {last.me ? 'Bạn: ' : ''}{last.text}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 7, paddingLeft: 8 }}>
                    <Text style={s.time}>{last.time}</Text>
                    {c.unread > 0 ? (
                      <View style={s.badge}><Text style={s.badgeText}>{c.unread > 5 ? '5+' : c.unread}</Text></View>
                    ) : <View style={{ height: 18 }} />}
                  </View>
                </View>
              </SwipeRow>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: LINE, marginLeft: 80 }} />}
        />
      )}
    </View>
  );
}

/* ---------- Tab Danh bạ ---------- */
function Contacts({ contacts, onOpen, onSearch, onAdd }) {
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Header title="Danh bạ" onSearch={onSearch} right={[
        <TouchableOpacity key="search" onPress={onSearch}><Ionicons name="search-outline" size={25} color={TEXT} /></TouchableOpacity>,
        <TouchableOpacity key="a" onPress={onAdd}><Ionicons name="add-circle-outline" size={27} color={TEXT} /></TouchableOpacity>,
      ]} />
      <View style={s.subTabs}>
        <Text style={[s.subTab, { color: TEXT, borderBottomColor: BLUE, borderBottomWidth: 2 }]}>Bạn bè ({contacts.length})</Text>
        <Text style={s.subTab}>Nhóm</Text>
      </View>
      {contacts.length === 0 ? (
        <Empty icon="people-outline" title="Chưa có bạn bè" sub="Bấm biểu tượng thêm bạn ở góc trên để tìm theo tên đăng nhập." action="Thêm bạn" onAction={onAdd} />
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.row} onPress={() => onOpen(item.id)} activeOpacity={0.6}>
              <Avatar name={item.display_name} size={44} />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={s.name}>{item.display_name}</Text>
                <Text style={s.last}>@{item.username}</Text>
              </View>
              <Ionicons name="chatbubble-outline" size={22} color={BLUE} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

/* ---------- Bài đăng ---------- */
function PostCard({ post, onLike, onComment, onDelete }) {
  const [open, setOpen] = useState(false);
  const [t, setT] = useState('');
  const liked = post.likes.includes(ME);
  const mine = post.author === ME;
  const submit = () => { if (t.trim()) { onComment(post.id, t.trim()); setT(''); } };
  return (
    <View style={s.post}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Avatar name={post.author} size={42} />
        <View style={{ marginLeft: 10, flex: 1 }}>
          <Text style={s.name}>{mine ? 'Bạn' : post.author}</Text>
          <Text style={{ fontSize: 12, color: SUB }}>{ago(post.ts)}</Text>
        </View>
        {mine && (
          <TouchableOpacity onPress={() => Alert.alert('Xóa bài đăng?', '', [
            { text: 'Hủy', style: 'cancel' },
            { text: 'Xóa', style: 'destructive', onPress: () => onDelete(post.id) },
          ])}>
            <Ionicons name="ellipsis-horizontal" size={22} color={SUB} />
          </TouchableOpacity>
        )}
      </View>
      <Text style={{ fontSize: 16, color: TEXT, marginTop: 10, lineHeight: 22 }}>{post.text}</Text>
      {(post.likes.length > 0 || post.comments.length > 0) && (
        <Text style={{ color: SUB, fontSize: 13, marginTop: 10 }}>
          {post.likes.length > 0 ? `${post.likes.length} lượt thích` : ''}
          {post.likes.length > 0 && post.comments.length > 0 ? '  ·  ' : ''}
          {post.comments.length > 0 ? `${post.comments.length} bình luận` : ''}
        </Text>
      )}
      <View style={s.postActions}>
        <TouchableOpacity style={s.postBtn} onPress={() => onLike(post.id)}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={22} color={liked ? RED : SUB} />
          <Text style={{ color: liked ? RED : SUB, marginLeft: 6, fontWeight: '500' }}>Thích</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.postBtn} onPress={() => setOpen(!open)}>
          <Ionicons name="chatbubble-outline" size={21} color={SUB} />
          <Text style={{ color: SUB, marginLeft: 6, fontWeight: '500' }}>Bình luận</Text>
        </TouchableOpacity>
      </View>
      {open && (
        <View>
          {post.comments.map((c) => (
            <View key={c.id} style={{ flexDirection: 'row', marginTop: 10 }}>
              <Avatar name={c.author} size={30} />
              <View style={s.comment}>
                <Text style={{ fontWeight: '600', color: TEXT, fontSize: 13 }}>{c.author === ME ? 'Bạn' : c.author}</Text>
                <Text style={{ color: TEXT, fontSize: 15 }}>{c.text}</Text>
              </View>
            </View>
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
            <TextInput style={s.commentInput} placeholder="Viết bình luận..." placeholderTextColor={SUB} value={t} onChangeText={setT} onSubmitEditing={submit} />
            <TouchableOpacity onPress={submit} style={{ marginLeft: 10 }}>
              <Ionicons name="send" size={22} color={t.trim() ? BLUE : '#B5BAC0'} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function Feed({ posts, onlyMine, onSearch, onCompose, onLike, onComment, onDelete }) {
  const data = onlyMine ? posts.filter((p) => p.author === ME) : posts;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title="Khám phá" onSearch={onSearch} right={[
        <TouchableOpacity key="search" onPress={onSearch}><Ionicons name="search-outline" size={25} color={TEXT} /></TouchableOpacity>,
        <TouchableOpacity key="c" onPress={onCompose}><Ionicons name="add-circle-outline" size={27} color={TEXT} /></TouchableOpacity>,
      ]} />
      <FlatList
        style={{ backgroundColor: BG }}
        data={data}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <TouchableOpacity style={s.composer} onPress={onCompose} activeOpacity={0.7}>
            <Avatar name={ME} size={40} />
            <Text style={{ color: SUB, fontSize: 16, marginLeft: 12, flex: 1 }}>Hôm nay bạn thế nào?</Text>
            <Ionicons name="create-outline" size={22} color={BLUE} />
          </TouchableOpacity>
        }
        ListEmptyComponent={<Empty icon="compass-outline" title="Chưa có nội dung mới" sub="Bạn sẽ thấy bài đăng từ những người mình theo dõi ở đây." />}
        renderItem={({ item }) => <PostCard post={item} onLike={onLike} onComment={onComment} onDelete={onDelete} />}
      />
    </KeyboardAvoidingView>
  );
}

/* ---------- Cá nhân ---------- */
function Profile({ me, onSearch, onLogout, onBackup, onRestore, onCheckUpdate }) {
  const item = (ic, l, onPress) => (
    <TouchableOpacity key={l} style={s.row} onPress={onPress} activeOpacity={onPress ? 0.6 : 1}>
      <Ionicons name={ic} size={24} color={BLUE} />
      <Text style={[s.name, { marginLeft: 16, flex: 1 }]}>{l}</Text>
      <Ionicons name="chevron-forward" size={20} color="#B5BAC0" />
    </TouchableOpacity>
  );
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Header title="Tôi" onSearch={onSearch} right={[
        <TouchableOpacity key="search" onPress={onSearch}><Ionicons name="search-outline" size={25} color={TEXT} /></TouchableOpacity>,
        <Ionicons key="s" name="settings-outline" size={24} color={TEXT} />
      ]} />
      <View style={[s.row, { paddingVertical: 16 }]}>
        <Avatar name={me.display_name} size={60} />
        <View style={{ marginLeft: 14, flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: TEXT }}>{me.display_name}</Text>
          <Text style={{ color: SUB, marginTop: 2 }}>@{me.username}</Text>
        </View>
      </View>
      <View style={{ marginTop: 8 }}>
        {item('cloud-upload-outline', 'Sao lưu tin nhắn', onBackup)}
        {item('cloud-download-outline', 'Khôi phục từ bản sao lưu', onRestore)}
        {item('reload-outline', 'Kiểm tra bản cập nhật', onCheckUpdate)}
        {item('shield-checkmark-outline', 'Tài khoản và bảo mật')}
        {item('lock-closed-outline', 'Quyền riêng tư')}
      </View>
      <Text style={{ color: SUB, fontSize: 13, marginHorizontal: 16, marginTop: 10, lineHeight: 18 }}>
        Tin nhắn được lưu ngay trong máy này. Hãy sao lưu thường xuyên: bấm "Sao lưu tin nhắn", rồi chọn Drive, Lưu vào Tệp hoặc iCloud Drive.
      </Text>
      <TouchableOpacity style={[s.row, { marginTop: 8, justifyContent: 'center' }]} onPress={onLogout}>
        <Text style={{ color: RED, fontSize: 16, fontWeight: '600' }}>Đăng xuất</Text>
      </TouchableOpacity>
    </View>
  );
}

/* ---------- Màn hình chat ---------- */
function Chat({ id, name, chat, onBack, onSend }) {
  const [text, setText] = useState('');
  const ref = useRef(null);
  const msgs = chat ? chat.messages : [];
  const send = () => { if (text.trim()) { onSend(id, text.trim()); setText(''); } };
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.header, { gap: 14 }]}>
        <TouchableOpacity onPress={onBack}><Ionicons name="chevron-back" size={26} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }} numberOfLines={1}>{name}</Text>
          <Text style={{ color: SUB, fontSize: 12 }}>Đang hoạt động</Text>
        </View>
        <Ionicons name="call-outline" size={22} color="#fff" />
        <Ionicons name="videocam-outline" size={24} color="#fff" />
        <Ionicons name="menu" size={24} color="#fff" />
      </View>
      {msgs.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Avatar name={name} size={72} />
          <Text style={{ marginTop: 12, fontSize: 16, fontWeight: '600', color: TEXT }}>{name}</Text>
          <Text style={{ color: SUB, marginTop: 4 }}>Hãy gửi lời chào đầu tiên 👋</Text>
        </View>
      ) : (
        <FlatList
          ref={ref}
          data={msgs}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 12 }}
          onContentSizeChange={() => ref.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View style={{ flexDirection: 'row', justifyContent: item.me ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
              {!item.me && <View style={{ marginRight: 8, alignSelf: 'flex-end' }}><Avatar name={name} size={30} /></View>}
              <View style={[s.bubble, item.me ? s.bubbleMe : s.bubbleOther]}>
                <Text style={{ fontSize: 16, color: item.me ? '#102214' : TEXT }}>{item.text}</Text>
                <Text style={{ fontSize: 11, color: SUB, marginTop: 4 }}>{item.time}</Text>
              </View>
            </View>
          )}
        />
      )}
      <View style={s.inputBar}>
        <Ionicons name="happy-outline" size={26} color={SUB} />
        <TextInput style={s.input} placeholder="Tin nhắn" placeholderTextColor={SUB} value={text} onChangeText={setText} onSubmitEditing={send} />
        {text.trim() ? (
          <TouchableOpacity onPress={send}><Ionicons name="send" size={24} color={BLUE} /></TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <Ionicons name="mic-outline" size={24} color={SUB} />
            <Ionicons name="image-outline" size={24} color={SUB} />
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

/* ---------- Tìm kiếm thật ---------- */
function Search({ contacts, chats, posts, nameOf, onBack, onOpenChat, onOpenPost }) {
  const [q, setQ] = useState('');
  const n = norm(q.trim());
  const fr = n ? contacts.filter((c) => norm(c.display_name).includes(n) || norm(c.username).includes(n)) : [];
  const ms = n ? Object.entries(chats).flatMap(([id, c]) =>
    c.messages.filter((m) => norm(m.text).includes(n)).map((m) => ({ key: id + m.id, chat: id, text: m.text }))) : [];
  const ps = n ? posts.filter((p) => norm(p.text).includes(n)) : [];
  const none = n && !fr.length && !ms.length && !ps.length;
  const title = (x) => <Text style={s.section}>{x}</Text>;
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[s.header, { gap: 10 }]}>
        <TouchableOpacity onPress={onBack}><Ionicons name="chevron-back" size={26} color="#fff" /></TouchableOpacity>
        <TextInput autoFocus style={s.searchInput} placeholder="Tìm bạn bè, tin nhắn, bài đăng" placeholderTextColor="#BBD9FF" value={q} onChangeText={setQ} />
        {q ? <TouchableOpacity onPress={() => setQ('')}><Ionicons name="close-circle" size={20} color="#D6E8FF" /></TouchableOpacity> : null}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled">
        {!n && <Text style={{ color: SUB, textAlign: 'center', marginTop: 40 }}>Nhập tên bạn bè, nội dung tin nhắn hoặc bài đăng</Text>}
        {none && <Text style={{ color: SUB, textAlign: 'center', marginTop: 40 }}>Không tìm thấy kết quả cho "{q}"</Text>}
        {fr.length > 0 && title('Bạn bè')}
        {fr.map((c) => (
          <TouchableOpacity key={c.id} style={s.row} onPress={() => onOpenChat(c.id)}>
            <Avatar name={c.display_name} size={42} /><Text style={[s.name, { marginLeft: 12 }]}>{c.display_name}</Text>
          </TouchableOpacity>
        ))}
        {ms.length > 0 && title('Tin nhắn')}
        {ms.map((m) => (
          <TouchableOpacity key={m.key} style={s.row} onPress={() => onOpenChat(m.chat)}>
            <Avatar name={nameOf(m.chat)} size={42} />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={s.name}>{nameOf(m.chat)}</Text>
              <Text style={s.last} numberOfLines={1}>{m.text}</Text>
            </View>
          </TouchableOpacity>
        ))}
        {ps.length > 0 && title('Bài đăng')}
        {ps.map((p) => (
          <TouchableOpacity key={p.id} style={s.row} onPress={onOpenPost}>
            <Avatar name={p.author} size={42} />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={s.name}>Bạn</Text>
              <Text style={s.last} numberOfLines={1}>{p.text}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

/* ---------- Đăng bài / Thêm bạn ---------- */
function Compose({ onClose, onPost }) {
  const [t, setT] = useState('');
  const ok = t.trim().length > 0;
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={s.header}>
        <TouchableOpacity onPress={onClose}><Text style={{ color: '#fff', fontSize: 16 }}>Hủy</Text></TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', color: '#fff', fontSize: 17, fontWeight: '600' }}>Tạo bài đăng</Text>
        <TouchableOpacity disabled={!ok} onPress={() => onPost(t.trim())}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', opacity: ok ? 1 : 0.5 }}>Đăng</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}>
        <Avatar name={ME} size={42} /><Text style={[s.name, { marginLeft: 10 }]}>Bạn</Text>
      </View>
      <TextInput autoFocus multiline style={{ fontSize: 18, paddingHorizontal: 16, color: TEXT, textAlignVertical: 'top' }} placeholder="Bạn đang nghĩ gì?" placeholderTextColor={SUB} value={t} onChangeText={setT} />
    </View>
  );
}

function AddFriend({ me, friendIds, onClose, onAdd, onChat }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const find = async () => {
    const c = q.trim().replace(/[,()%*\\]/g, '');
    if (!c) return;
    setBusy(true);
    const { data, error } = await supabase.from('profiles').select('*')
      .or(`username.ilike.%${c}%,display_name.ilike.%${c}%`).neq('id', me.id).limit(20);
    setBusy(false);
    if (error) Alert.alert('Lỗi', error.message); else setRes(data);
  };
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[s.header, { gap: 14 }]}>
        <TouchableOpacity onPress={onClose}><Ionicons name="chevron-back" size={26} color="#fff" /></TouchableOpacity>
        <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>Thêm bạn</Text>
      </View>
      <View style={{ padding: 16, flexDirection: 'row', gap: 10 }}>
        <TextInput autoFocus style={[s.addInput, { flex: 1 }]} placeholder="Tên đăng nhập hoặc tên hiển thị" placeholderTextColor={SUB}
          value={q} onChangeText={setQ} onSubmitEditing={find} autoCapitalize="none" />
        <TouchableOpacity style={[s.primaryBtn, { marginTop: 0, justifyContent: 'center' }]} onPress={find}>
          {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="search" size={20} color="#fff" />}
        </TouchableOpacity>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled">
        {res && res.length === 0 && <Text style={{ color: SUB, textAlign: 'center', marginTop: 30 }}>Không tìm thấy người dùng nào</Text>}
        {(res || []).map((p) => {
          const isFriend = friendIds.includes(p.id);
          return (
            <View key={p.id} style={s.row}>
              <Avatar name={p.display_name} size={44} />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={s.name}>{p.display_name}</Text>
                <Text style={s.last}>@{p.username}</Text>
              </View>
              <TouchableOpacity style={[s.smallBtn, isFriend && { backgroundColor: '#E8F2FF' }]} onPress={() => (isFriend ? onChat(p.id) : onAdd(p))}>
                <Text style={{ color: isFriend ? BLUE : '#fff', fontWeight: '600' }}>{isFriend ? 'Nhắn tin' : 'Thêm bạn'}</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Auth() {
  const [mode, setMode] = useState('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    if (!email.trim() || pw.length < 6) { setErr('Nhập email và mật khẩu (tối thiểu 6 ký tự)'); return; }
    setBusy(true); setErr('');
    const cred = { email: email.trim(), password: pw };
    const { data, error } = mode === 'in' ? await supabase.auth.signInWithPassword(cred) : await supabase.auth.signUp(cred);
    setBusy(false);
    if (error) setErr(vi(error.message));
    else if (mode === 'up' && !data.session) Alert.alert('Kiểm tra email', 'Hãy bấm liên kết xác nhận trong email rồi quay lại đăng nhập.');
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 56, fontWeight: '800', color: BLUE, textAlign: 'center' }}>Zou</Text>
        <Text style={{ color: SUB, textAlign: 'center', marginBottom: 28 }}>{mode === 'in' ? 'Đăng nhập để tiếp tục' : 'Tạo tài khoản mới'}</Text>
        <TextInput style={s.addInput} placeholder="Email" placeholderTextColor={SUB} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={[s.addInput, { marginTop: 12 }]} placeholder="Mật khẩu" placeholderTextColor={SUB} secureTextEntry value={pw} onChangeText={setPw} onSubmitEditing={submit} />
        {err ? <Text style={{ color: RED, marginTop: 10 }}>{err}</Text> : null}
        <TouchableOpacity style={[s.primaryBtn, { alignItems: 'center' }]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>{mode === 'in' ? 'Đăng nhập' : 'Đăng ký'}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setMode(mode === 'in' ? 'up' : 'in'); setErr(''); }} style={{ marginTop: 18, alignItems: 'center' }}>
          <Text style={{ color: BLUE, fontSize: 15 }}>{mode === 'in' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Setup({ session, onDone }) {
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    const u = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(u)) { setErr('Tên đăng nhập 3-20 ký tự: chữ thường không dấu, số hoặc dấu _'); return; }
    if (!name.trim()) { setErr('Hãy nhập tên hiển thị'); return; }
    setBusy(true); setErr('');
    const { data, error } = await supabase.from('profiles').insert({ id: session.user.id, username: u, display_name: name.trim() }).select().single();
    setBusy(false);
    if (error) setErr(error.code === '23505' ? 'Tên đăng nhập này đã có người dùng' : error.message);
    else onDone(data);
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 24, fontWeight: '700', color: TEXT, textAlign: 'center' }}>Hoàn tất hồ sơ</Text>
        <Text style={{ color: SUB, textAlign: 'center', marginBottom: 24, marginTop: 6 }}>Bạn bè sẽ tìm bạn bằng tên đăng nhập</Text>
        <TextInput style={s.addInput} placeholder="Tên đăng nhập (vd: hung_01)" placeholderTextColor={SUB} autoCapitalize="none" value={username} onChangeText={setUsername} />
        <TextInput style={[s.addInput, { marginTop: 12 }]} placeholder="Tên hiển thị (vd: Hùng)" placeholderTextColor={SUB} value={name} onChangeText={setName} onSubmitEditing={submit} />
        {err ? <Text style={{ color: RED, marginTop: 10 }}>{err}</Text> : null}
        <TouchableOpacity style={[s.primaryBtn, { alignItems: 'center' }]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Tiếp tục</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => supabase.auth.signOut()} style={{ marginTop: 18, alignItems: 'center' }}>
          <Text style={{ color: SUB }}>Đăng xuất</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ---------- Màn hình khởi động ---------- */
function Splash({ onDone }) {
  const op = useRef(new Animated.Value(0)).current;
  const sc = useRef(new Animated.Value(0.88)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(op, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(sc, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
      Animated.delay(600),
      Animated.timing(op, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(onDone);
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ opacity: op, transform: [{ scale: sc }], alignItems: 'center' }}>
        <Text style={{ fontSize: 64, fontWeight: '800', color: BLUE, letterSpacing: 1 }}>Zou</Text>
        <Text style={{ color: SUB, fontSize: 15, marginTop: 6 }}>Nhắn tin, kết nối</Text>
      </Animated.View>
    </View>
  );
}

/* ---------- App ---------- */
const TABS = [
  ['chatbubble', 'chatbubble-outline', 'Trò chuyện'],
  ['people', 'people-outline', 'Danh bạ'],
  ['compass', 'compass-outline', 'Khám phá'],
  ['person', 'person-outline', 'Tôi'],
];

function Main({ me }) {
  const [tab, setTab] = useState(0);
  const [screen, setScreen] = useState(null);
  const [kb, setKb] = useState(false);
  const [profiles, setProfiles] = useState({ [me.id]: me });
  const [friendIds, setFriendIds] = useState([]);
  // Tin nhắn được nạp từ bộ nhớ trong máy trước, rồi mới gộp với dữ liệu từ máy chủ
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem('zou:msgs:' + me.id)) || []; }
    catch { return []; }
  });
  const [posts, setPosts] = useState(INITIAL_POSTS);
  const [local, setLocal] = useState(() => {
    try { return JSON.parse(localStorage.getItem('zou:' + me.id)) || { lastRead: {}, cleared: {} }; }
    catch { return { lastRead: {}, cleared: {} }; }
  });
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

  const nameOf = (id) => profiles[id]?.display_name || 'Người dùng';
  const updateLocal = (fn) => setLocal((prev) => {
    const n = fn(prev);
    try { localStorage.setItem('zou:' + me.id, JSON.stringify(n)); } catch {}
    return n;
  });
  const ensureProfiles = async (ids) => {
    const missing = [...new Set(ids)].filter((i) => !profilesRef.current[i]);
    if (!missing.length) return;
    const { data } = await supabase.from('profiles').select('*').in('id', missing);
    if (data) setProfiles((p) => { const n = { ...p }; data.forEach((x) => { n[x.id] = x; }); return n; });
  };
  const addMessage = (m) => setMessages((prev) =>
    prev.some((x) => x.id === m.id) ? prev
      : [...prev, m].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)));

  // Mỗi khi danh sách tin nhắn thay đổi thì lưu lại vào máy
  useEffect(() => {
    try { localStorage.setItem('zou:msgs:' + me.id, JSON.stringify(messages)); } catch {}
  }, [messages]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [f, m] = await Promise.all([
        supabase.from('friends').select('friend_id'),
        supabase.from('messages').select('*').order('created_at', { ascending: true }).limit(2000),
      ]);
      if (!active) return;
      const fids = (f.data || []).map((x) => x.friend_id);
      const msgs = m.data || [];
      setFriendIds(fids);
      setMessages((prev) => {
        const map = new Map(prev.map((x) => [x.id, x]));
        msgs.forEach((x) => map.set(x.id, x));
        return sortMsgs([...map.values()]);
      });
      ensureProfiles([...fids, ...msgs, ...messages].flatMap((x) => (typeof x === 'string' ? [x] : [x.sender, x.receiver])));
    })();
    const ch = supabase.channel('messages-' + me.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        addMessage(payload.new);
        ensureProfiles([payload.new.sender, payload.new.receiver]);
      })
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    const a = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKb(true));
    const b = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(false));
    return () => { a.remove(); b.remove(); };
  }, []);

  const chats = useMemo(() => {
    const out = {};
    for (const m of messages) {
      const other = m.sender === me.id ? m.receiver : m.sender;
      const ts = Date.parse(m.created_at);
      if (ts <= (local.cleared[other] || 0)) continue;
      const c = out[other] || (out[other] = { messages: [], unread: 0, ts: 0 });
      const d = new Date(ts);
      c.messages.push({ id: String(m.id), me: m.sender === me.id, text: m.content, time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, ts });
      c.ts = ts;
      if (m.sender !== me.id && ts > (local.lastRead[other] || 0)) c.unread++;
    }
    return out;
  }, [messages, local]);

  const unreadTotal = Object.values(chats).reduce((n, c) => n + c.unread, 0);
  const contacts = friendIds.map((id) => profiles[id]).filter(Boolean)
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  useEffect(() => {
    if (screen?.type !== 'chat') return;
    const c = chats[screen.id];
    if (!c) return;
    const last = c.ts;
    if ((local.lastRead[screen.id] || 0) < last) updateLocal((l) => ({ ...l, lastRead: { ...l.lastRead, [screen.id]: last } }));
  }, [screen, chats]);

  const openChat = (id) => setScreen({ type: 'chat', id });
  const closeScreen = () => setScreen(null);

  const send = async (id, text) => {
    const { data, error } = await supabase.from('messages').insert({ receiver: id, content: text }).select().single();
    if (error) Alert.alert('Không gửi được', error.message); else addMessage(data);
  };
  const deleteChat = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    updateLocal((l) => ({ ...l, cleared: { ...l.cleared, [id]: chats[id] ? chats[id].ts : Date.now() } }));
  };
  const readChat = (id) => updateLocal((l) => ({ ...l, lastRead: { ...l.lastRead, [id]: chats[id] ? chats[id].ts : Date.now() } }));

  /* ----- Sao lưu / khôi phục (lưu ra file .json rồi chọn nơi cất: Drive, Tệp, iCloud...) ----- */
  const backup = async () => {
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Không hỗ trợ', 'Máy này không mở được bảng chia sẻ.');
        return;
      }
      const d = new Date();
      const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      const file = new File(Paths.cache, `zou-backup-${stamp}.json`);
      file.create();
      await file.write(JSON.stringify({ app: 'zou', version: 1, userId: me.id, exportedAt: d.toISOString(), messages, local }));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Lưu bản sao lưu Zou' });
    } catch (e) {
      Alert.alert('Sao lưu thất bại', String((e && e.message) || e));
    }
  };

  const restore = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled || !res.assets || !res.assets.length) return;
      const raw = await new File(res.assets[0].uri).text();
      const data = JSON.parse(raw);
      if (data.app !== 'zou' || !Array.isArray(data.messages)) {
        Alert.alert('File không hợp lệ', 'Đây không phải file sao lưu của Zou.');
        return;
      }
      if (data.userId !== me.id) {
        Alert.alert('Sai tài khoản', 'Bản sao lưu này thuộc về một tài khoản khác. Hãy đăng nhập đúng tài khoản đã sao lưu.');
        return;
      }
      setMessages((prev) => {
        const map = new Map(prev.map((x) => [x.id, x]));
        data.messages.forEach((x) => map.set(x.id, x));
        return sortMsgs([...map.values()]);
      });
      const dl = data.local || {};
      updateLocal((l) => ({ lastRead: mergeMax(l.lastRead, dl.lastRead), cleared: mergeMax(l.cleared, dl.cleared) }));
      ensureProfiles(data.messages.flatMap((x) => [x.sender, x.receiver]));
      Alert.alert('Xong', `Đã khôi phục ${data.messages.length} tin nhắn.`);
    } catch (e) {
      Alert.alert('Khôi phục thất bại', String((e && e.message) || e));
    }
  };

  const addFriend = async (p) => {
    const { error } = await supabase.from('friends').insert({ friend_id: p.id });
    if (error && error.code !== '23505') { Alert.alert('Lỗi', error.message); return; }
    setProfiles((x) => ({ ...x, [p.id]: p }));
    setFriendIds((f) => (f.includes(p.id) ? f : [...f, p.id]));
  };

  const addPost = (text) => {
    setPosts((p) => [{ id: 'p' + Date.now(), author: ME, text, ts: Date.now(), likes: [], comments: [] }, ...p]);
    closeScreen();
  };
  const like = (id) => setPosts((p) => p.map((x) => x.id !== id ? x : {
    ...x, likes: x.likes.includes(ME) ? x.likes.filter((l) => l !== ME) : [...x.likes, ME],
  }));
  const comment = (id, text) => setPosts((p) => p.map((x) => x.id !== id ? x : {
    ...x, comments: [...x.comments, { id: 'c' + Date.now(), author: ME, text }],
  }));
  const delPost = (id) => setPosts((p) => p.filter((x) => x.id !== id));

  const shared = { onSearch: () => setScreen({ type: 'search' }) };
  const goAdd = () => setScreen({ type: 'addfriend' });
  const goCompose = () => setScreen({ type: 'compose' });
  const checkForUpdate = async () => {
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) { Alert.alert('Zou đã mới nhất', 'Chưa có bản cập nhật nào để tải.'); return; }
      await Updates.fetchUpdateAsync();
      Alert.alert('Đã tải bản mới', 'Chọn OK để mở lại ứng dụng với giao diện mới.', [{ text: 'OK', onPress: () => Updates.reloadAsync() }]);
    } catch {
      Alert.alert('Chưa thể kiểm tra', 'Tính năng này hoạt động trên bản IPA mới đã bật Expo Updates.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {screen?.type === 'chat' ? (
        <Chat id={screen.id} name={nameOf(screen.id)} chat={chats[screen.id]} onBack={closeScreen} onSend={send} />
      ) : screen?.type === 'search' ? (
        <Search contacts={contacts} chats={chats} posts={posts} nameOf={nameOf} onBack={closeScreen}
          onOpenChat={openChat} onOpenPost={() => { setTab(2); closeScreen(); }} />
      ) : screen?.type === 'compose' ? (
        <Compose onClose={closeScreen} onPost={addPost} />
      ) : screen?.type === 'addfriend' ? (
        <AddFriend me={me} friendIds={friendIds} onClose={closeScreen} onAdd={addFriend} onChat={openChat} />
      ) : (
        <>
          <View style={{ flex: 1 }}>
            {tab === 0 && <Messages chats={chats} nameOf={nameOf} {...shared} onOpen={openChat} onAdd={goAdd}
              onDelete={deleteChat} onRead={readChat} goContacts={() => setTab(1)} />}
            {tab === 1 && <Contacts contacts={contacts} {...shared} onOpen={openChat} onAdd={goAdd} />}
            {tab === 2 && <Feed posts={posts} {...shared} onCompose={goCompose} onLike={like} onComment={comment} onDelete={delPost} />}
            {tab === 3 && <Profile me={me} {...shared} onLogout={() => supabase.auth.signOut()} onBackup={backup} onRestore={restore} onCheckUpdate={checkForUpdate} />}
          </View>
          {!kb && (
            <View style={s.tabBar}>
              {TABS.map(([on, off, label], i) => (
                <TouchableOpacity key={label} style={s.tab} onPress={() => setTab(i)} activeOpacity={0.7}>
                  <View>
                    <Ionicons name={tab === i ? on : off} size={25} color={tab === i ? BLUE : SUB} />
                    {i === 0 && unreadTotal > 0 && (
                      <View style={s.tabBadge}><Text style={s.badgeText}>{unreadTotal > 99 ? '99+' : unreadTotal}</Text></View>
                    )}
                  </View>
                  <Text style={{ fontSize: 11, marginTop: 2, color: tab === i ? BLUE : SUB }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function Loading({ err, onRetry }) {
  return (
    <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
      {err ? (
        <>
          <Text style={{ color: SUB }}>Không kết nối được máy chủ</Text>
          <TouchableOpacity style={s.primaryBtn} onPress={onRetry}><Text style={{ color: '#fff', fontWeight: '600' }}>Thử lại</Text></TouchableOpacity>
        </>
      ) : <ActivityIndicator size="large" color={BLUE} />}
    </View>
  );
}

export default function App() {
  const [splash, setSplash] = useState(true);
  const [session, setSession] = useState(undefined);
  const [me, setMe] = useState(undefined);
  const [loadErr, setLoadErr] = useState(false);
  const [tries, setTries] = useState(0);
  const uid = session?.user?.id;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!uid) { setMe(undefined); return; }
    let on = true;
    setLoadErr(false);
    supabase.from('profiles').select('*').eq('id', uid).maybeSingle().then(({ data, error }) => {
      if (!on) return;
      if (error) setLoadErr(true); else setMe(data || null);
    });
    return () => { on = false; };
  }, [uid, tries]);

  let body;
  if (splash) body = <Splash onDone={() => setSplash(false)} />;
  else if (session === undefined || (session && me === undefined)) body = <Loading err={loadErr} onRetry={() => setTries(tries + 1)} />;
  else if (!session) body = <Auth />;
  else if (me === null) body = <Setup session={session} onDone={setMe} />;
  else body = <Main key={me.id} me={me} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 }}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />
      {body}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  smallBtn: { backgroundColor: BLUE, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  header: { backgroundColor: SURFACE, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 56, borderBottomWidth: 1, borderBottomColor: LINE },
  headerTitle: { color: TEXT, fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
  searchInput: { flex: 1, color: TEXT, fontSize: 16, height: 40 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: SURFACE },
  name: { fontSize: 16, fontWeight: '500', color: TEXT },
  last: { fontSize: 14, color: SUB, marginTop: 3 },
  time: { fontSize: 12, color: SUB },
  badge: { backgroundColor: RED, borderRadius: 9, minWidth: 18, height: 18, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  tabBadge: { position: 'absolute', top: -5, right: -12, backgroundColor: RED, borderRadius: 9, minWidth: 18, height: 18, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: SURFACE },
  actions: { position: 'absolute', right: 0, top: 0, bottom: 0, width: ACTION_W, flexDirection: 'row' },
  actionBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: '#fff', fontSize: 12, marginTop: 3, fontWeight: '500' },
  subTabs: { flexDirection: 'row', backgroundColor: SURFACE, borderBottomWidth: 1, borderBottomColor: LINE },
  subTab: { flex: 1, textAlign: 'center', paddingVertical: 12, fontSize: 15, fontWeight: '500', color: SUB },
  tabBar: { flexDirection: 'row', backgroundColor: SURFACE, borderTopWidth: 1, borderTopColor: LINE, paddingBottom: 6 },
  tab: { flex: 1, alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  bubble: { maxWidth: '75%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  bubbleMe: { backgroundColor: BLUE },
  bubbleOther: { backgroundColor: SURFACE },
  inputBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: SURFACE, paddingHorizontal: 12, paddingVertical: 8, gap: 10, borderTopWidth: 1, borderTopColor: LINE },
  input: { flex: 1, fontSize: 16, paddingVertical: 6, color: TEXT },
  primaryBtn: { backgroundColor: BLUE, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24, marginTop: 20 },
  composer: { flexDirection: 'row', alignItems: 'center', backgroundColor: SURFACE, padding: 14, marginBottom: 8 },
  post: { backgroundColor: SURFACE, padding: 14, marginBottom: 8 },
  postActions: { flexDirection: 'row', marginTop: 10, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 4 },
  postBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  comment: { marginLeft: 8, backgroundColor: BG, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, flexShrink: 1 },
  commentInput: { flex: 1, backgroundColor: BG, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, fontSize: 15, color: TEXT },
  section: { fontSize: 13, fontWeight: '700', color: SUB, backgroundColor: BG, paddingHorizontal: 14, paddingVertical: 8, marginTop: 4 },
  addInput: { borderWidth: 1, borderColor: LINE, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: TEXT },
});
