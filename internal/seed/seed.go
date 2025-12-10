package seed

import (
	"fmt"
	"opslab-survey/internal/models"
)

// Participants returns the fixed list of allowed people (Anastasiia excluded).
func Participants() []models.Participant {
	return []models.Participant{
		{Code: "1122", Name: "Катерина Петухова", Email: "kateryna.petukhova@opslab.uk"},
		{Code: "1425", Name: "Марія Василик", Email: "mariya.vasylyk@opslab.uk"},
		{Code: "3814", Name: "Ірина Мячкова", Email: "iryna.miachkova@opslab.uk"},
		{Code: "4582", Name: "Вероніка Кухарчук", Email: "veronika.kukharchuk@opslab.uk"},
		{Code: "6738", Name: "Іванна Сакало", Email: "ivanna.sakalo@opslab.uk"},
		{Code: "7139", Name: "Jane Давидюк", Email: "janedavydiuk@opslab.uk"},
		{Code: "8463", Name: "Оксана Клінчаян", Email: "oksana.klinchaian@opslab.uk"},
		{Code: "9267", Name: "Михайло Іващук", Email: "mykhailo.ivashchuk@opslab.uk"},
		{Code: "0000", Name: "Олег Камінський (Адмін/тест)", Email: "work.olegkaminskyi@gmail.com", IsAdmin: true},
	}
}

// CommonQuestions supplies ~20% shared prompts.
func CommonQuestions() []models.Question {
	return []models.Question{
		{
			ID:          "common:ownership-clarity",
			Title:       "Де команді бракує чіткої власності?",
			Description: "Назвіть 1-2 процеси, де відповідальність розмита, і що допоможе зробити межі чіткими.",
			Type:        "text",
			Scope:       "common",
		},
		{
			ID:          "common:leadership-speed",
			Title:       "Що зараз уповільнює лідерські рішення?",
			Description: "Конкретний бар'єр чи патерн, який пригальмовує рух і як його зняти.",
			Type:        "text",
			Scope:       "common",
		},
		{
			ID:          "common:business-bet",
			Title:       "Один сміливий бізнес-бет для OPSLAB",
			Description: "Оберіть напрямок, у який варто інвестувати найближчі 3 місяці.",
			Type:        "choice",
			Choice:      []string{"Розвиток нової послуги", "Поглиблення відносин з топ-клієнтами", "Автоматизація операцій", "Запуск експериментального ринку"},
			Scope:       "common",
		},
		{
			ID:          "common:cadence",
			Title:       "Наскільки стабільно ми виконуємо обіцянки?",
			Description: "Оцініть від 1 (хаос) до 5 (стабільний ритм). Додайте короткий контекст.",
			Type:        "scale",
			ScaleMax:    5,
			Scope:       "common",
		},
		{
			ID:          "common:trust-signal",
			Title:       "Що підвищило б довіру в команді?",
			Description: "Один простий ритуал чи правило, яке відразу підсилить взаємну довіру.",
			Type:        "text",
			Scope:       "common",
		},
	}
}

// PeerQuestionTemplates are varied phrasings around одна тема для різних людей.
type PeerQuestionTemplate struct {
	ID            string
	TitleFmt      string
	DescriptionFmt string
	Type          string
	ScaleMax      int
	Choice        []string
}

func PeerTemplates() []PeerQuestionTemplate {
	return []PeerQuestionTemplate{
		{
			ID:            "peer:ownership-tone",
			TitleFmt:      "Як %s забирає відповідальність у сірій зоні?",
			DescriptionFmt: "Пригадайте ситуацію, де %s сам/сама взяв(ла) на себе рішення без мандату. 1 – уникає, 5 – забирає і тримає.",
			Type:          "scale",
			ScaleMax:      5,
		},
		{
			ID:            "peer:followthrough",
			TitleFmt:      "Що гарантує доведення справ до кінця у %s?",
			DescriptionFmt: "Коротко опишіть конкретну звичку чи патерн, що робить %s надійним/ною (або чого не вистачає).",
			Type:          "text",
		},
		{
			ID:            "peer:lead-initiative",
			TitleFmt:      "Чи доручили б ви %s нову ініціативу?",
			DescriptionFmt: "Оберіть варіант і, за потреби, додайте зауваження.",
			Type:          "choice",
			Choice:        []string{"Так, без сумнівів", "Так, з супроводом", "Поки ні"},
		},
		{
			ID:            "peer:business-lens",
			TitleFmt:      "Наскільки %s мислить бізнес-результатом?",
			DescriptionFmt: "1 – фокусується лише на задачі, 5 – мислить впливом на гроші/клієнта/операції.",
			Type:          "scale",
			ScaleMax:      5,
		},
	}
}

// BuildPeerQuestions returns expanded questions for concrete colleagues.
func BuildPeerQuestions(peers []models.Participant) []models.Question {
	var out []models.Question
	for _, peer := range peers {
		for idx, t := range PeerTemplates() {
			id := fmt.Sprintf("%s:%s:%d", t.ID, peer.Code, idx)
			out = append(out, models.Question{
				ID:          id,
				Title:       fmt.Sprintf(t.TitleFmt, peer.Name),
				Description: fmt.Sprintf(t.DescriptionFmt, peer.Name),
				Type:        t.Type,
				ScaleMax:    t.ScaleMax,
				Choice:      t.Choice,
				Scope:       "peer",
				PeerCode:    peer.Code,
			})
		}
	}
	return out
}
