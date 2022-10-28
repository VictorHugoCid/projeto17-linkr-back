import { connection } from "../database/database.js";
import { postRepository } from "../repositories/postRepositories.js";

async function CreatePost(req, res) {
  const { text, link } = req.body;
  const { userId } = res.locals;

  const hashtagsArray = [];

  await text.split(" ").forEach((value) => {
    if (value[0] === "#") {
      hashtagsArray.push(value.replace("#", ""));
    }
  });

  try {
    await postRepository.insertPost(userId, text, link);
    const getPost = await connection.query(
      `
    SELECT * FROM posts 
    WHERE posts."userId" = $1`,
      [userId]
    );

    if (hashtagsArray.length !== 0) {
      for (let i = 0; i < hashtagsArray.length; i++) {
        const atual = hashtagsArray[i];
        const isHashtagExists = await postRepository.getHashtagIdByName(atual);
        let hashtagId;

        if (isHashtagExists.rowCount !== 0) {
          hashtagId = isHashtagExists.rows[0].id;
          await insertHashPost(hashtagId, userId, text, link);

          continue;
        }

        await postRepository.insertHashtag(atual);

        const newHashtagId = await postRepository.getHashtagIdByName(atual);

        hashtagId = newHashtagId.rows[0].id;
        await insertHashPost(hashtagId, userId, text, link);
      }
    }

    return res.sendStatus(201);
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: error.message });
  }
}

async function GetPost(req, res) {
  const token = req.headers.authorization?.replace("Bearer ", "");

  try {
    const { rows: user } = await connection.query(
      `SELECT sessions."userId" FROM sessions WHERE sessions.token = $1`,
      [token]
    );
    const { userId } = user[0];
    const { rows: getPosts } = await connection.query(
      `
      SELECT
        p.id AS "postId",
        p.text,
        p.link,
        u."pictureUrl" AS "userImg",
        u.name AS username,
        p."userId",
        l."likesQtd",
        j."userLiked", 
        repost."repostCount",
        repost.id AS "repostId",
        repost."userId" AS "repostUser",
        "respostUserName",
        comments."commentCount"
      FROM
        posts p
      JOIN
        users u ON p."userId"= u.id

      LEFT JOIN
      (SELECT
        l."postId",
        COUNT(l."userId") AS "likesQtd"
      FROM
        likes l
      GROUP BY
        l."postId") l ON p.id=l."postId"

      LEFT JOIN
        (SELECT
        l."postId",
      COUNT(l."userId") AS "userLiked"
      FROM 
        likes l
      WHERE
          l."userId" = $1
      GROUP BY
        l."postId"       
       
      ) j ON p.id = j."postId"

      LEFT JOIN
      (SELECT repost."postId", COUNT(repost."postId") AS "repostCount", repost.id, repost."userId", 
       users.name as "respostUserName"
       FROM repost 
       JOIN users on users.id = repost."userId"
       GROUP BY repost.id, "respostUserName"
      ) repost ON p.id = repost."postId"
      LEFT JOIN
      (SELECT comments."postId", COUNT(comments."postId") AS "commentCount" 
       FROM comments GROUP BY comments."postId"
        ) comments ON p.id = comments."postId"
      
      ORDER BY
        p.id DESC`,
      [userId]
    );

    res.status(201).send(getPosts);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
}

async function GetPostByUserId(req, res) {
  const userId = req.params.id;
  const loggedUserId = res.locals.userId;

  try {
    const getPosts = await connection.query(
      `SELECT     feed.id, feed."repostId" as "feedRepostId",
      p.id as "postId", p."userId" as "postUserId",p.text, p.link,
      up."pictureUrl" AS "userImg",
      up.name AS "nameUserPost",
      r."userId" as "RepostUserId",
      ur.name AS "resposUserName",
      l."likesQtd",  
      j."userLiked",
       repost."repostCount",
       comments."commentCount"
FROM feed
LEFT JOIN repost AS r on feed."repostId" = r.id
LEFT JOIN posts as p on feed."postId" = p.id    
LEFT JOIN users as up on p."userId" = up.id
LEFT JOIN users as ur on r."userId" = ur.id

--     LIKES QUANTIDADE
LEFT JOIN (
  SELECT l."postId", COUNT(l."userId") AS "likesQtd"
  FROM likes l
  GROUP BY l."postId"
) l ON p.id = l."postId"

-- USER LIKED
LEFT JOIN 
(
  SELECT l."postId", COUNT(l."userId") AS "userLiked"
  FROM  likes l
  WHERE l."userId" = 13
  GROUP BY l."postId"       
) j ON p.id = j."postId"

--     REPOST COUNT
LEFT JOIN
(
  SELECT repost."postId", COUNT(repost."postId") AS "repostCount", repost.id, repost."userId" 
   FROM repost 
   GROUP BY repost.id
) repost ON p.id = repost."postId"

--     COMENTARIO
LEFT JOIN
(
  SELECT comments."postId", COUNT(comments."postId") AS "commentCount" 
   FROM comments GROUP BY comments."postId"
) comments ON p.id = comments."postId"`,
      [userId, loggedUserId]
    );
    res.status(201).send(getPosts.rows);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
}
async function EditPost(req, res) {
  const { id } = req.params;
  const { text } = req.body;
  let textMessage = "";

  try {
    const getPosts = await connection.query("SELECT * FROM posts WHERE id = $1", [id]);
    if (text) {
      textMessage = " Texto";
      const updateText = await connection.query("UPDATE posts SET text = $1 WHERE id = $2", [
        text,
        id,
      ]);
    }
    res.status(201).send({ message: `foram atualizados: ${textMessage}` });
  } catch (error) {
    res.status(404).send({ message: "url não encontrado" });
  }
}

async function DeletePost(req, res) {
  const { id } = req.params;

  try {
    // await connection.query("DELETE FROM posts WHERE id = $1", [id]);
    await postRepository.deletePost(id);

    res.status(204).send({ message: "menssagem deletada" });
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
}

async function insertHashPost(hashtagId, userId, text, link) {
  const postId = await postRepository.getPostId(userId, text, link);
  await connection.query('INSERT INTO "hashPost" ("postId", "hashtagId") VALUES ($1, $2)', [
    postId.rows[0].id,
    hashtagId,
  ]);
}

async function updateLike(req, res) {
  const { postId } = req.body;
  const token = req.headers.authorization?.replace("Bearer ", "");

  try {
    const session = await connection.query('SELECT * FROM sessions WHERE sessions."token" = $1', [
      token,
    ]);
    const userId = session.rows[0].userId;

    console.log(userId, postId);
    await connection.query('DELETE FROM likes WHERE "userId" = $1 AND "postId" = $2', [
      userId,
      postId,
    ]);

    res.sendStatus(200);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
}

async function CreateRepost(req, res) {
  const { postId, userId } = req.body;
  try {
    await postRepository.insertRepost(postId, userId);
    res.sendStatus(200);
  } catch (error) {
    res.status(501).send({ message: error.message });
  }
}

async function GetComments(req, res) {
  const { postId, userId } = req.params;
  try {
    const Comments = await connection.query(
      `
    select 
    comment,
	users.id AS "userId",
    users."pictureUrl",
    users."name",
	follow.follows
    from comments 
    join users on users.id = comments."userId"
	left join (SELECT follow.follows FROM follow where follow."userId" = $1 GROUP BY follow.follows
    ) follow ON users.id = follow.follows
    where "postId" = $2`,
      [userId, postId]
    );
    res.status(201).send(Comments.rows);
  } catch (error) {
    res.status(501).send({ message: error.message });
  }
}

async function InsertComment(req, res) {
  const { postId } = req.params;
  const { userId, comment } = req.body;
  try {
    const query = await connection.query(
      `
    INSERT INTO comments 
    ("postId", "userId", comment) 
    Values ($1, $2, $3)`,
      [postId, userId, comment]
    );

    res.sendStatus(201);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
}

async function getAlertNewPosts(req, res) {
  const { createdAt } = req.body;
  // console.log('CREATEAD :', req.body)
  try {
    const { rows: posts } = await connection.query(
      `
                            SELECT * FROM posts
                            WHERE posts."createdAt" > $1
                          `,
      [createdAt]
    );
    return res.status(200).send(posts.length.toString());
  } catch (error) {
    console.log("error getAlertNewPosts :", error);
    res.sendStatus(500);
  }
}
export {
  CreatePost,
  EditPost,
  DeletePost,
  GetPost,
  updateLike,
  GetPostByUserId,
  GetComments,
  InsertComment,
  getAlertNewPosts,
  CreateRepost,
};
