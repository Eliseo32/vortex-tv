package com.vortex.tv.ui.player

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CutCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.vortex.tv.data.AppViewModel
import com.vortex.tv.data.model.ContentItem
import com.vortex.tv.ui.content.DetailDark
import com.vortex.tv.ui.content.DetailMechaButton

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun PartySetupScreen(
    item: ContentItem,
    viewModel: AppViewModel,
    onStartParty: (roomCode: String) -> Unit,
    onBack: () -> Unit
) {
    var joinCode by remember { mutableStateOf("") }
    val generatedCode = remember { "VRTX-${(1000..9999).random()}" }
    
    val canJoin = joinCode.length >= 4

    val playItem by viewModel.currentPlayItem.collectAsState()
    val videoUrlToUse = playItem?.videoUrl ?: item.videoUrl ?: ""

    Box(modifier = Modifier.fillMaxSize().background(DetailDark)) {
        // Fondo optimizado sin blur
        AsyncImage(
            model = item.backdrop?.ifEmpty { item.poster },
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop,
            alpha = 0.2f
        )
        Box(modifier = Modifier.fillMaxSize().background(
            Brush.verticalGradient(listOf(Color.Transparent, DetailDark.copy(alpha = 0.9f)))
        ))
        
        Box(modifier = Modifier.fillMaxSize().background(
            Brush.verticalGradient(listOf(Color.Transparent, Color(0x1139FF14), Color.Transparent))
        ))

        Column(
            modifier = Modifier.fillMaxSize().padding(64.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(modifier = Modifier.size(10.dp).background(Color(0xFF7431F9), CutCornerShape(3.dp)))
                Spacer(modifier = Modifier.width(16.dp))
                Text(
                    text = "VORTEX PARTY // ENLACE COMPARTIDO",
                    color = Color(0xFF7431F9),
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 8.sp
                )
            }
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = "TRANSMISIÓN: ${item.title?.uppercase()}",
                color = Color.White,
                fontSize = 32.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 4.sp
            )

            Spacer(modifier = Modifier.height(60.dp))

            Row(modifier = Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(40.dp)) {
                
                Box(
                    modifier = Modifier.weight(1f).fillMaxHeight()
                        .background(Color(0x337431F9), CutCornerShape(30.dp))
                        .border(2.dp, Color(0xFF7431F9), CutCornerShape(30.dp))
                        .padding(40.dp)
                ) {
                    Column(modifier = Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("CREAR NÚCLEO (ANFITRIÓN)", color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Black, letterSpacing = 2.sp)
                        Spacer(modifier = Modifier.height(40.dp))
                        
                        Box(modifier = Modifier.fillMaxWidth().background(Color(0x66000000), CutCornerShape(16.dp)).border(1.dp, Color(0x33FFFFFF), CutCornerShape(16.dp)).padding(32.dp), contentAlignment = Alignment.Center) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("CÓDIGO DE ENLACE", color = Color.Gray, fontSize = 14.sp, letterSpacing = 4.sp, fontWeight = FontWeight.Bold)
                                Spacer(modifier = Modifier.height(16.dp))
                                Text(
                                    text = generatedCode,
                                    color = Color(0xFF39FF14),
                                    fontSize = 48.sp,
                                    fontWeight = FontWeight.Black,
                                    letterSpacing = 8.sp
                                )
                            }
                        }
                        
                        Spacer(modifier = Modifier.weight(1f))
                        
                        DetailMechaButton(
                            label = "INICIAR SALA MAESTRA",
                            icon = "▶",
                            isPrimary = false,
                            onClick = { 
                                viewModel.createPartyRoom(generatedCode, videoUrlToUse)
                                onStartParty(generatedCode) 
                            }
                        )
                    }
                }

                Box(
                    modifier = Modifier.weight(1f).fillMaxHeight()
                        .background(Color(0x1A39FF14), CutCornerShape(30.dp))
                        .border(2.dp, Color(0xFF39FF14), CutCornerShape(30.dp))
                        .padding(40.dp)
                ) {
                    Column(modifier = Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("CONECTAR A NÚCLEO (INVITADO)", color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Black, letterSpacing = 2.sp)
                        Spacer(modifier = Modifier.height(40.dp))
                        
                        androidx.compose.material3.OutlinedTextField(
                            value = joinCode,
                            onValueChange = { joinCode = it.uppercase() },
                            modifier = Modifier.fillMaxWidth(),
                            placeholder = { Text("VRTX-0000", color = Color.DarkGray, fontSize = 32.sp, letterSpacing = 8.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) },
                            singleLine = true,
                            textStyle = TextStyle(
                                color = Color.White,
                                fontSize = 32.sp,
                                fontWeight = FontWeight.Black,
                                letterSpacing = 8.sp,
                                textAlign = TextAlign.Center
                            ),
                            colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Color(0xFF39FF14),
                                unfocusedBorderColor = Color(0x3339FF14)
                            ),
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done)
                        )
                        
                        Spacer(modifier = Modifier.weight(1f))
                        
                        var btnFocused by remember { mutableStateOf(false) }
                        Box(
                            modifier = Modifier
                                .onFocusChanged { btnFocused = it.isFocused }
                                .clickable(enabled = canJoin) { 
                                    viewModel.joinPartyRoom(joinCode)
                                    onStartParty(joinCode) 
                                }
                                .background(if (canJoin) Color(0xFF39FF14) else Color(0x33000000), CutCornerShape(16.dp))
                                .border(if (btnFocused) 3.dp else 1.dp, if (canJoin) Color.White else Color(0x33FFFFFF), CutCornerShape(16.dp))
                                .padding(horizontal = 40.dp, vertical = 16.dp)
                        ) {
                            Text(
                                "CONECTAR", 
                                color = if (canJoin) Color.Black else Color.Gray, 
                                fontWeight = FontWeight.Black, 
                                letterSpacing = 4.sp, 
                                fontSize = 16.sp
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(40.dp))
            
            var cancelFocused by remember { mutableStateOf(false) }
            Box(
                modifier = Modifier
                    .onFocusChanged { cancelFocused = it.isFocused }
                    .clickable { onBack() }
                    .background(if (cancelFocused) Color(0xFFFF6600) else Color.Transparent, CutCornerShape(12.dp))
                    .border(2.dp, if (cancelFocused) Color.White else Color(0xFFFF6600), CutCornerShape(12.dp))
                    .padding(horizontal = 40.dp, vertical = 12.dp)
            ) {
                Text("ABORTAR CONEXIÓN", color = if (cancelFocused) Color.Black else Color(0xFFFF6600), fontWeight = FontWeight.Black, letterSpacing = 2.sp)
            }
        }
    }
}